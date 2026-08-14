from types import SimpleNamespace

import pytest
from jinja2.exceptions import SecurityError
from sqlalchemy.orm import Session

from deepsel.apps.cms.utils.render_wysiwyg_content import (
    render_template_content,
    render_wysiwyg_content,
)
from deepsel.utils.models_pool import models_pool

OrganizationModel = models_pool["organization"]

# Classic Jinja2 SSTI technique: `self` always refers to the current
# TemplateReference, whose `__init__.__globals__` reaches the interpreter's
# builtins regardless of what context variables the caller passed in.
SSTI_PAYLOAD = (
    "{{ self.__init__.__globals__.__builtins__"
    ".__import__('os').popen('id').read() }}"
)


def _make_org(db: Session) -> int:
    org = OrganizationModel(name="Test Org")
    db.add(org)
    db.commit()
    return org.id


def test_render_template_content_blocks_ssti_payload(db: Session):
    """Regression test for authenticated RCE: template content is
    user-authored (Template feature in admin), so it must render in a
    sandboxed environment that blocks access to Python internals."""
    organization_id = _make_org(db)

    with pytest.raises(SecurityError):
        render_template_content(SSTI_PAYLOAD, "malicious", organization_id, db)


def test_render_template_content_blocks_resource_exhaustion_payload(db: Session):
    """SandboxedEnvironment blocks Python-object traversal (RCE) but not
    resource consumption — `"x" * n` can allocate unbounded memory in one
    step. 5,000,000 is safely allocatable even if this regresses (unlike a
    realistic attack magnitude), while still far exceeding the intended cap,
    so this stays a fast, safe regression test either way."""
    organization_id = _make_org(db)

    with pytest.raises(SecurityError):
        render_template_content(
            '{{ "x" * 5000000 }}', "resource-bomb", organization_id, db
        )


def test_render_template_content_blocks_nested_loop_cpu_exhaustion(db: Session):
    """Neither the `*`/`**` operation cap nor the output-length cap sees a
    loop with an empty body: two nested range() loops, each individually
    under jinja2's own per-call range cap, produce no large allocation and
    no output at all. 1200x1200 (1,440,000 total iterations, empty bodies)
    exceeds the render budget while staying fast/safe to actually run even
    if this regresses."""
    organization_id = _make_org(db)
    payload = (
        "{% for i in range(1200) %}{% for j in range(1200) %}{% endfor %}{% endfor %}"
    )

    with pytest.raises(SecurityError):
        render_template_content(payload, "loop-bomb", organization_id, db)


def test_render_wysiwyg_content_blocks_ssti_and_falls_back_to_raw_content(
    db: Session,
):
    """Same vulnerability, reached via page/blog WYSIWYG content. The
    function swallows render errors and returns the original content, so a
    blocked payload must come back unexecuted rather than as command output."""
    organization_id = _make_org(db)
    page_content = SimpleNamespace(content=SSTI_PAYLOAD)

    result = render_wysiwyg_content(page_content, organization_id, db)

    assert result == SSTI_PAYLOAD  # nosec B101


def test_render_wysiwyg_content_blocks_resource_exhaustion_and_falls_back_to_raw_content(
    db: Session,
):
    """Same resource-exhaustion gap, reached via page/blog WYSIWYG content.
    The function swallows render errors and returns the original content, so
    a blocked payload must come back unexecuted rather than actually
    allocating the requested amount of memory."""
    organization_id = _make_org(db)
    payload = '{{ "x" * 5000000 }}'
    page_content = SimpleNamespace(content=payload)

    result = render_wysiwyg_content(page_content, organization_id, db)

    assert result == payload  # nosec B101


def test_render_wysiwyg_content_blocks_nested_loop_cpu_exhaustion_and_falls_back(
    db: Session,
):
    """Same nested-loop gap, reached via page/blog WYSIWYG content."""
    organization_id = _make_org(db)
    payload = (
        "{% for i in range(1200) %}{% for j in range(1200) %}{% endfor %}{% endfor %}"
    )
    page_content = SimpleNamespace(content=payload)

    result = render_wysiwyg_content(page_content, organization_id, db)

    assert result == payload  # nosec B101


def test_render_wysiwyg_content_still_renders_legitimate_templates(db: Session):
    """Guard against the sandbox switch breaking normal rendering: plain
    variable access (no dunder/underscore attributes) must still work."""
    organization_id = _make_org(db)
    page_content = SimpleNamespace(content="Hello {{ user.name }}!")
    user = SimpleNamespace(id=1, name="Ada", last_name="Lovelace", first_name="Ada")

    result = render_wysiwyg_content(page_content, organization_id, db, user=user)

    assert result == "Hello Ada!"  # nosec B101
