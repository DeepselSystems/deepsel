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


def _make_org(db: Session) -> int:
    org = OrganizationModel(name="Test Org")
    db.add(org)
    db.commit()
    return org.id


def _make_user(db: Session, organization_id: int, permissions: list[str]):
    """A signed-up user whose role grants exactly `permissions` — mirrors how a
    real default (e.g. newly signed-up, no CMS role assigned) user looks: a
    role row exists, but its permissions list has nothing for template_content."""
    role = RoleModel(
        name="Test Role",
        organization_id=organization_id,
        permissions=json.dumps(permissions),
    )
    db.add(role)
    db.commit()

    user = UserModel(
        email=f"user-{role.id}@test.com",
        username=f"user-{role.id}",
        signed_up=True,
    )
    user.roles.append(role)
    db.add(user)
    db.commit()
    return user


def test_render_content_blocks_ssti_without_leaking_internals(db: Session):
    """A SecurityError from the sandboxed engine must not reach the client
    as a raw 500 with the Jinja2/Python internals in the message — that
    fingerprints the sandbox for an attacker and confuses legitimate authors.
    It should be a generic 400 instead."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:own"])
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


def test_render_content_still_500s_on_other_render_errors(db: Session):
    """Non-security render errors (e.g. a template syntax typo) keep the
    existing generic 500 behavior — only SecurityError gets special-cased."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:own"])
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


def test_render_content_allows_user_with_template_write_permission(db: Session):
    """The counterpart to the rejection test above: a user whose role does
    grant template_content write access must still be able to render."""
    organization_id = _make_org(db)
    user = _make_user(db, organization_id, ["template_content:write:own"])
    request = RenderTemplateRequest(
        content="Hello {{ 1 + 1 }}",
        name="harmless",
        organization_id=organization_id,
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
