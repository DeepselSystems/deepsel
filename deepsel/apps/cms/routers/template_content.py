from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db
from deepsel.auth.get_current_user import get_current_user
from deepsel.orm.types import PermissionAction, PermissionScope
from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.models_pool import models_pool
from ..schemas.template_content import (
    TemplateContentCreate,
    TemplateContentRead,
    TemplateContentSearch,
    TemplateContentUpdate,
)
from fastapi import Depends, Body, HTTPException
from jinja2.exceptions import SecurityError
from ..utils.render_wysiwyg_content import render_template_content
import logging
from traceback import print_exc

logger = logging.getLogger(__name__)
table_name = "template_content"
TemplateContentModel = models_pool[table_name]

router = CRUDRouter(
    read_schema=TemplateContentRead,
    search_schema=TemplateContentSearch,
    create_schema=TemplateContentCreate,
    update_schema=TemplateContentUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)


class RenderTemplateRequest(BaseModel):
    content: str
    name: str
    organization_id: int
    lang: Optional[str] = None


@router.post("/render")
def render_content(
    request: RenderTemplateRequest = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Render template content using Jinja2 templating engine.

    Bare authentication isn't enough here — rendering executes user-authored
    Jinja syntax, so it's gated behind the same permission as authoring a
    template (write), not just "is logged in".
    """
    allowed, scope = TemplateContentModel._check_has_permission(
        PermissionAction.write, user
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to render template content",
        )
    # `allowed` alone isn't enough — rendering loads and exposes every
    # template_content row for `organization_id` (client-supplied) as
    # {% extends %}/{% include %} targets, plus that org's public settings,
    # so which orgs a given scope may target has to be enforced explicitly:
    #
    # - `*`: unrestricted, by design (e.g. a super-admin-style role).
    # - `org`: only the org(s) the user actually belongs to
    #   (user.get_org_ids()) — otherwise a write:org user in one tenant could
    #   point organization_id at a different tenant and have that tenant's
    #   templates/settings rendered back to them.
    # - `own`: template_content has no `owner_id` column, so per
    #   `_build_query_based_on_scope`'s documented fail-closed convention
    #   (own/org scope with no recognized ownership/org column matches
    #   nothing), `own` already grants nothing on this table via
    #   search/get_one/update/delete. Loading the *entire* org's templates
    #   here can't distinguish "the user's own" from anyone else's, so `own`
    #   must never be sufficient to render — not even for the user's own org.
    if scope == PermissionScope.all:
        pass
    elif scope == PermissionScope.org and request.organization_id in user.get_org_ids():
        pass
    else:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to render template content for this organization",
        )
    try:
        rendered_content = render_template_content(
            content=request.content,
            name=request.name,
            organization_id=request.organization_id,
            db=db,
            lang=request.lang,
            user=user,
        )
        return {"rendered_content": rendered_content}
    except SecurityError as e:
        # Don't leak the sandbox's internal error message to the client —
        # it fingerprints the sandboxing mechanism for an attacker. Full
        # detail goes to the server log only.
        logger.error(f"Blocked disallowed template syntax: {e}")
        raise HTTPException(
            status_code=400, detail="Template contains disallowed syntax"
        )
    except Exception as e:
        logger.error(f"Error render template")
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))
