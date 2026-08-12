import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from deepsel.apps.cms.routers.template_content import (
    RenderTemplateRequest,
    render_content,
)
from deepsel.utils.models_pool import models_pool

OrganizationModel = models_pool["organization"]

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


def test_render_content_blocks_ssti_without_leaking_internals(db: Session):
    """A SecurityError from the sandboxed engine must not reach the client
    as a raw 500 with the Jinja2/Python internals in the message — that
    fingerprints the sandbox for an attacker and confuses legitimate authors.
    It should be a generic 400 instead."""
    organization_id = _make_org(db)
    request = RenderTemplateRequest(
        content=SSTI_PAYLOAD,
        name="malicious",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=None, db=db)

    assert exc_info.value.status_code == 400  # nosec B101
    assert "TemplateReference" not in exc_info.value.detail  # nosec B101
    assert "__init__" not in exc_info.value.detail  # nosec B101


def test_render_content_still_500s_on_other_render_errors(db: Session):
    """Non-security render errors (e.g. a template syntax typo) keep the
    existing generic 500 behavior — only SecurityError gets special-cased."""
    organization_id = _make_org(db)
    request = RenderTemplateRequest(
        content="{% if unclosed %}",
        name="broken",
        organization_id=organization_id,
    )

    with pytest.raises(HTTPException) as exc_info:
        render_content(request=request, user=None, db=db)

    assert exc_info.value.status_code == 500  # nosec B101
