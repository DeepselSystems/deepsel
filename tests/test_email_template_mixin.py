import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# import deepsel.utils first to avoid circular-import quirk during collection
from deepsel.utils.models_pool import models_pool  # noqa: F401

from deepsel.orm.email_template_mixin import EmailTemplateMixin
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
