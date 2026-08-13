import json

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from deepsel.apps.cms.routers.template_content import (
    RenderTemplateRequest,
    render_content,
)
from deepsel.utils.models_pool import models_pool

OrganizationModel = models_pool["organization"]
RoleModel = models_pool["role"]
UserModel = models_pool["user"]
TemplateContentModel = models_pool["template_content"]
LocaleModel = models_pool["locale"]
TemplateModel = models_pool["template"]

# Same SSTI payload used in test_render_wysiwyg_content.py — kept local since
# it exercises a different failure path (the HTTP layer's error response).
SSTI_PAYLOAD = (
    "{{ self.__init__.__globals__.__builtins__"
    ".__import__('os').popen('id').read() }}"
)


def _make_org(db: Session, name: str = "Test Org") -> int:
    # `organization.name` is unique — tests creating more than one org (e.g.
    # cross-tenant scenarios) must pass distinct names.
    org = OrganizationModel(name=name)
    db.add(org)
    db.commit()
    return org.id


def _make_user(db: Session, organization_id: int, permissions: list[str]):
    """A signed-up user whose role grants exactly `permissions` — mirrors how a
    real default (e.g. newly signed-up, no CMS role assigned) user looks: a
    role row exists, but its permissions list has nothing for template_content.
    Also makes the user a member of `organization_id` (user_organization row),
    matching what a real user of that org looks like — needed for scope
    (own/org vs *) checks that key off `user.get_org_ids()`."""
    role = RoleModel(
        name="Test Role",
        organization_id=organization_id,
        permissions=json.dumps(permissions),
    )
    db.add(role)
    db.commit()

    org = db.query(OrganizationModel).get(organization_id)
    user = UserModel(
        email=f"user-{role.id}@test.com",
        username=f"user-{role.id}",
        signed_up=True,
    )
    user.roles.append(role)
    user.organizations.append(org)
    db.add(user)
    db.commit()
    return user


def test_render_content_blocks_ssti_without_leaking_internals(db: Session):
    """A SecurityError from the sandboxed engine must not reach the client
    as a raw 500 with the Jinja2/Python internals in the message — that
    fingerprints the sandbox for an attacker and confuses legitimate authors.
    It should be a generic 400 instead."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:org"])
    request = RenderTemplateRequest(
        content=SSTI_PAYLOAD,
        name="malicious",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 400  # nosec B101
    assert "TemplateReference" not in exc_info.value.detail  # nosec B101
    assert "__init__" not in exc_info.value.detail  # nosec B101


def test_render_content_blocks_resource_exhaustion_payload(db: Session):
    """SandboxedEnvironment blocks Python-object traversal (RCE) but not
    resource consumption — `"x" * n` can allocate unbounded memory in one
    step through this same endpoint. Also routed to a generic 400, same as
    the SSTI case above."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:org"])
    request = RenderTemplateRequest(
        content='{{ "x" * 5000000 }}',
        name="resource-bomb",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 400  # nosec B101


def test_render_content_still_500s_on_other_render_errors(db: Session):
    """Non-security render errors (e.g. a template syntax typo) keep the
    existing generic 500 behavior — only SecurityError gets special-cased."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:org"])
    request = RenderTemplateRequest(
        content="{% if unclosed %}",
        name="broken",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 500  # nosec B101


def test_render_content_rejects_user_without_template_write_permission(
    db: Session,
):
    """Recommendation 3: bare authentication is not enough — a signed-up user
    whose role has no template_content permission (the default for a public
    signup, which gets no CMS role at all) must be rejected with 403 before
    any Jinja2 rendering happens, not allowed through like any other
    authenticated user."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, [])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 403  # nosec B101


def test_render_content_allows_user_with_org_scope_permission(db: Session):
    """The counterpart to the rejection test above: a user whose role grants
    org-scoped template_content write access must still be able to render
    for their own org."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:org"])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=organization_id,
    )

    result = render_content(request=request, user=user, db=db)

    assert result == {"rendered_content": "Hello 2"}  # nosec B101


def test_render_content_rejects_own_scope_even_for_users_own_organization(
    db: Session,
):
    """Second PR review finding: `template_content` has no `owner_id` column,
    so per `_build_query_based_on_scope`'s documented fail-closed convention
    (own/org scope with no recognized ownership/org column on the model
    matches nothing), a `write:own` grant is not meant to unlock anything on
    this table anywhere else in the codebase — search/get_one/update/delete
    all silently return nothing for it. The render route must match that:
    loading every template in the org to resolve {% extends %}/{% include %}
    is an org-wide operation, so `own` scope — which can't distinguish "my
    templates" from anyone else's here — must never be sufficient, even for
    the user's own org. (An earlier fix only checked org membership, which
    let `write:own` behave exactly like `write:org` — this test targets that
    gap specifically, independent of the cross-tenant case below.)"""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:own"])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 403  # nosec B101


def test_render_content_rejects_cross_tenant_organization_id(db: Session):
    """PR review finding: `_check_has_permission` returns [allowed, scope] but
    the route previously discarded scope, checking only `allowed`. A user
    scoped to their own org (template_content:write:org — no `*` grant) could
    submit an arbitrary `organization_id` in the request body and the render
    would load THAT org's templates (as {% extends %}/{% include %} targets)
    and public settings — cross-tenant data exposure, not just a rendering
    quirk. Only a `*`-scoped permission may render for an org the user isn't
    a member of."""
    own_org_id = _make_org(db, "Own Org")
    other_org_id = _make_org(db, "Other Org")
    user = _make_user(db, own_org_id, ["template_content:write:org"])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=other_org_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=user, db=db)

    assert exc_info.value.status_code == 403  # nosec B101


def test_render_content_allows_star_scope_across_organizations(db: Session):
    """Counterpart to the cross-tenant rejection above: a `*`-scoped
    permission (e.g. a super-admin-style role) is explicitly meant to act
    across every org, so it must not be blocked by the membership check."""
    own_org_id = _make_org(db, "Own Org")
    other_org_id = _make_org(db, "Other Org")
    user = _make_user(db, own_org_id, ["template_content:write:*"])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=other_org_id,
    )

    result = render_content(request=request, user=user, db=db)

    assert result == {"rendered_content": "Hello 2"}  # nosec B101


def test_user_without_template_write_permission_cannot_create_template_content(
    db: Session,
):
    """Recommendation 3's second half: confirm the same public/anonymous/
    signup-style user (no template_content permission) also can't create a
    template_content row directly — this is pre-existing behavior enforced by
    ORMBaseMixin.create()'s own permission check, not new code from this
    task, but it's the other half of what the report asked to be confirmed."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, [])
    locale = LocaleModel(name="English", iso_code="en")
    db.add(locale)
    template = TemplateModel(name="Test Template", organization_id=organization_id)
    db.add(template)
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        TemplateContentModel.create(
            db,
            user,
            {
                "content": "Hello {{ 1 + 1 }}",
                "locale_id": locale.id,
                "template_id": template.id,
                "organization_id": organization_id,
            },
        )

    assert exc_info.value.status_code == 403  # nosec B101
