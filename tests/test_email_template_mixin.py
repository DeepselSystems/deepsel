import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# import deepsel.utils first to avoid circular-import quirk during collection
from deepsel.utils.models_pool import models_pool  # noqa: F401

from deepsel.orm.email_template_mixin import EmailTemplateMixin
from deepsel.utils.jinja2_sandbox import MAX_TOTAL_LOOP_ITERATIONS
from deepsel.utils.send_email import EmailRateLimitError


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


_ORG_MODEL = object()  # marker passed to db.query()


def _make_org(rate_limit=200):
    return SimpleNamespace(
        mail_send_rate_limit_per_hour=rate_limit,
        mail_username="u",
        mail_password="p",
        mail_from="from@x.com",
        mail_from_name="From",
        mail_port=587,
        mail_server="smtp.x.com",
        mail_ssl_tls=False,
        mail_starttls=True,
        mail_use_credentials=True,
        mail_validate_certs=False,
        mail_timeout=60,
    )


class FakeTemplate(EmailTemplateMixin):
    def __init__(self, content, subject, organization_id=1):
        self.content = content
        self.subject = subject
        self.organization_id = organization_id

    @classmethod
    def _get_organization_model(cls):
        return _ORG_MODEL


class SideEffectObject:
    def __init__(self):
        self.method_called = False
        self.safe_value = "ok"

    def delete_everything(self):
        self.method_called = True
        return "deleted"


def _db_with_org(org):
    db = MagicMock()
    db.query.return_value.get.return_value = org
    return db


class TestSend:
    def test_renders_content_and_subject(self):
        tpl = FakeTemplate("Hello {{ name }}!", "Hi {{ name }}")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={"name": "Tim"}))
        assert ok is True
        _, kwargs = send_mock.call_args
        assert kwargs["content"] == "Hello Tim!"
        assert kwargs["subject"] == "Hi Tim"

    def test_subject_override(self):
        tpl = FakeTemplate("body", "rendered subject")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            _run(tpl.send(db, to=["a@x.com"], context={}, subject="Override"))
        assert send_mock.call_args.kwargs["subject"] == "Override"

    def test_org_not_found_returns_false(self):
        tpl = FakeTemplate("body", "subj")
        db = _db_with_org(None)
        with patch(
            "deepsel.orm.email_template_mixin.send_email_with_limit",
            AsyncMock(),
        ) as send_mock:
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_context_object_public_method_call_is_blocked(self):
        """Regression test for callable access from context objects.

        Templates are user-authored and untrusted; passing rich Python
        objects directly would allow side-effecting method calls such as
        `{{ obj.delete_everything() }}` if context is not sanitized.
        """
        dangerous = SideEffectObject()
        tpl = FakeTemplate("{{ obj.delete_everything() }}", "subj")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={"obj": dangerous}))
        assert ok is False
        assert dangerous.method_called is False
        send_mock.assert_not_called()

    def test_none_rate_limit_defaults_to_200(self):
        tpl = FakeTemplate("body", "subj")
        db = _db_with_org(_make_org(rate_limit=None))
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            _run(tpl.send(db, to=["a@x.com"], context={}))
        assert send_mock.call_args.kwargs["rate_limit_per_hour"] == 200

    def test_rate_limit_error_returns_false(self):
        tpl = FakeTemplate("body", "subj")
        db = _db_with_org(_make_org())
        with patch(
            "deepsel.orm.email_template_mixin.send_email_with_limit",
            AsyncMock(side_effect=EmailRateLimitError("slow down", 60)),
        ):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False

    def test_generic_error_returns_false(self):
        tpl = FakeTemplate("body", "subj")
        db = _db_with_org(_make_org())
        with patch(
            "deepsel.orm.email_template_mixin.send_email_with_limit",
            AsyncMock(side_effect=RuntimeError("smtp down")),
        ):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False

    def test_ssti_payload_in_content_is_blocked(self):
        """Regression test for SSTI/RCE: template content is attacker-controlled
        (org-authored email templates), so `self.__init__.__globals__` must not
        grant access to Python internals during rendering."""
        malicious = (
            "{{ self.__init__.__globals__.__builtins__"
            ".__import__('os').popen('id').read() }}"
        )
        tpl = FakeTemplate(malicious, "subj")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_ssti_payload_in_subject_is_blocked(self):
        """Same as above, for the subject template."""
        malicious = (
            "{{ self.__init__.__globals__.__builtins__"
            ".__import__('os').popen('id').read() }}"
        )
        tpl = FakeTemplate("body", malicious)
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_resource_exhaustion_payload_in_content_is_blocked(self):
        """SandboxedEnvironment blocks Python-object traversal (RCE) but not
        resource consumption — `"x" * n` can allocate unbounded memory in
        one step. 5,000,000 is safely allocatable even if this regresses
        (unlike a realistic attack magnitude), while still far exceeding the
        intended cap, so this stays a fast, safe regression test either way."""
        tpl = FakeTemplate('{{ "x" * 5000000 }}', "subj")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_resource_exhaustion_payload_in_subject_is_blocked(self):
        """Same as above, for the subject template."""
        tpl = FakeTemplate("body", '{{ "x" * 5000000 }}')
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_nested_loop_cpu_exhaustion_in_content_is_blocked(self):
        """Neither the `*`/`**` operation cap nor the output-length cap sees
        a loop with an empty body (no large allocation, no output) — same
        gap as above, reached via email content."""
        payload = (
            "{% for i in range(1200) %}{% for j in range(1200) %}"
            "{% endfor %}{% endfor %}"
        )
        tpl = FakeTemplate(payload, "subj")
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is False
        send_mock.assert_not_called()

    def test_body_and_subject_do_not_share_iteration_budget(self):
        """PR review finding: content and subject were rendered through the
        same environment instance, and the iteration budget is per-instance
        mutable state — so rendering the body first could spend most/all of
        the budget before the (independently legitimate) subject render even
        starts, failing a valid subject for a reason it has nothing to do
        with. 999,000 (999 * 1000, staying under jinja2's own per-call
        MAX_RANGE=100,000 in each dimension) is comfortably under
        MAX_TOTAL_LOOP_ITERATIONS on its own; only a shared budget would
        make the *second* render of it fail."""
        assert 999 * 1000 < MAX_TOTAL_LOOP_ITERATIONS  # nosec B101
        loop_template = (
            "{% for i in range(999) %}{% for j in range(1000) %}"
            "{% endfor %}{% endfor %}ok"
        )
        tpl = FakeTemplate(loop_template, loop_template)
        db = _db_with_org(_make_org())
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.orm.email_template_mixin.send_email_with_limit", send_mock):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}))
        assert ok is True
        assert send_mock.call_args.kwargs["content"] == "ok"
        assert send_mock.call_args.kwargs["subject"] == "ok"


class FakeTemplateWithSuperOrg(FakeTemplate):
    @classmethod
    def _get_super_org_string_id(cls):
        return "1"


class TestSmtpFallback:
    """A tenant template whose own org has no SMTP sends through the platform
    org; a configured tenant org keeps its own; nothing configured -> False."""

    @staticmethod
    def _tenant(configured=False):
        org = _make_org()
        org.id = 2
        if not configured:
            org.mail_server = None
            org.mail_from = None
        else:
            org.mail_server = "smtp.tenant.com"
            org.mail_from = "owner@tenant.com"
            org.mail_from_name = "Tenant"
        return org

    @staticmethod
    def _platform(configured=True):
        org = _make_org(rate_limit=50)
        org.id = 1
        org.mail_server = "smtp.platform.com" if configured else None
        org.mail_from = "noreply@platform.com" if configured else None
        org.mail_from_name = "Platform"
        return org

    @staticmethod
    def _db(orgs, by_string_id=None):
        db = MagicMock()
        db.query.return_value.get.side_effect = lambda i: orgs.get(i)
        db.query.return_value.filter_by.return_value.first.return_value = by_string_id
        return db

    def _send(self, tpl, db, settings, **kwargs):
        send_mock = AsyncMock(return_value={"success": True})
        with patch("deepsel.deps.settings", settings), patch(
            "deepsel.orm.email_template_mixin.send_email_with_limit", send_mock
        ):
            ok = _run(tpl.send(db, to=["a@x.com"], context={}, **kwargs))
        return ok, send_mock

    def test_tenant_without_smtp_sends_through_platform_org(self):
        db = self._db({1: self._platform(), 2: self._tenant()})
        tpl = FakeTemplate("Hi", "Subj", organization_id=2)
        ok, send_mock = self._send(tpl, db, SimpleNamespace(DEFAULT_ORG_ID=1))
        assert ok is True
        kwargs = send_mock.call_args.kwargs
        assert kwargs["mail_server"] == "smtp.platform.com"
        assert kwargs["mail_from"] == "noreply@platform.com"
        assert kwargs["mail_from_name"] == "Platform"
        assert kwargs["rate_limit_per_hour"] == 50
        assert kwargs["reply_to"] is None

    def test_tenant_with_own_smtp_keeps_it(self):
        db = self._db({1: self._platform(), 2: self._tenant(configured=True)})
        tpl = FakeTemplate("Hi", "Subj", organization_id=2)
        ok, send_mock = self._send(tpl, db, SimpleNamespace(DEFAULT_ORG_ID=1))
        assert ok is True
        kwargs = send_mock.call_args.kwargs
        assert kwargs["mail_server"] == "smtp.tenant.com"
        assert kwargs["mail_from_name"] == "Tenant"
        assert kwargs["rate_limit_per_hour"] == 200
        # the platform org was never loaded
        assert [c.args for c in db.query.return_value.get.call_args_list] == [(2,)]

    def test_from_name_and_reply_to_are_forwarded(self):
        db = self._db({1: self._platform(), 2: self._tenant()})
        tpl = FakeTemplate("Hi", "Subj", organization_id=2)
        ok, send_mock = self._send(
            tpl,
            db,
            SimpleNamespace(DEFAULT_ORG_ID=1),
            from_name="Comfort Air",
            reply_to=["shop@comfortair.com"],
        )
        assert ok is True
        kwargs = send_mock.call_args.kwargs
        assert kwargs["mail_from_name"] == "Comfort Air"
        assert kwargs["reply_to"] == ["shop@comfortair.com"]
        assert kwargs["mail_from"] == "noreply@platform.com"

    def test_nothing_configured_returns_false_without_sending(self):
        db = self._db({1: self._platform(configured=False), 2: self._tenant()})
        tpl = FakeTemplate("Hi", "Subj", organization_id=2)
        ok, send_mock = self._send(tpl, db, SimpleNamespace(DEFAULT_ORG_ID=1))
        assert ok is False
        send_mock.assert_not_called()

    def test_platform_template_without_smtp_returns_false(self):
        # the template's org IS the platform org: no second lookup, no send
        db = self._db({1: self._platform(configured=False)})
        tpl = FakeTemplate("Hi", "Subj", organization_id=1)
        ok, send_mock = self._send(tpl, db, SimpleNamespace(DEFAULT_ORG_ID=1))
        assert ok is False
        send_mock.assert_not_called()
        assert [c.args for c in db.query.return_value.get.call_args_list] == [(1,)]

    def test_falls_back_to_super_org_string_id_without_settings(self):
        db = self._db({2: self._tenant()}, by_string_id=self._platform())
        tpl = FakeTemplateWithSuperOrg("Hi", "Subj", organization_id=2)
        ok, send_mock = self._send(tpl, db, None)
        assert ok is True
        assert send_mock.call_args.kwargs["mail_server"] == "smtp.platform.com"
        db.query.return_value.filter_by.assert_called_with(string_id="1")
