import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from deepsel.utils.email_doser import EmailDoser
from deepsel.utils.send_email import (
    send_email_with_limit,
    EmailRateLimitError,
    DEFAULT_EMAIL_MAX_RETRIES,
    DEFAULT_EMAIL_RETRY_DELAY,
    _get_email_retry_config,
    _try_send_email_with_retry,
)


def _run(coro):
    """Helper to run async functions in sync tests."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


SMTP_CONFIG = {
    "mail_username": "test@example.com",
    "mail_password": "password",
    "mail_from": "test@example.com",
    "mail_from_name": "Test",
    "mail_port": 587,
    "mail_server": "smtp.example.com",
    "mail_ssl_tls": False,
    "mail_starttls": True,
    "mail_use_credentials": True,
    "mail_validate_certs": False,
    "mail_timeout": 60,
    "rate_limit_per_hour": 200,
}


@patch("deepsel.utils.send_email.FastMail")
@patch("deepsel.utils.send_email.get_global_email_doser")
@patch("deepsel.utils.send_email.update_global_limits")
def test_successful_send(mock_update, mock_get_doser, mock_fastmail):
    doser = EmailDoser(max_emails=200, per_seconds=3600)
    mock_get_doser.return_value = doser

    mock_fm_instance = MagicMock()
    mock_fm_instance.send_message = AsyncMock()
    mock_fastmail.return_value = mock_fm_instance

    result = _run(
        send_email_with_limit(
            to=["recipient@example.com"],
            subject="Test",
            content="<p>Hello</p>",
            **SMTP_CONFIG,
        )
    )

    assert result["success"] is True
    assert result["status"] == "sent"
    assert result["recipients_count"] == 1
    mock_fm_instance.send_message.assert_awaited_once()


@patch("deepsel.utils.send_email.get_global_email_doser")
@patch("deepsel.utils.send_email.update_global_limits")
def test_rate_limited(mock_update, mock_get_doser):
    doser = EmailDoser(max_emails=1, per_seconds=3600)
    doser.record_send()  # exhaust limit
    mock_get_doser.return_value = doser

    with pytest.raises(EmailRateLimitError):
        _run(
            send_email_with_limit(
                to=["recipient@example.com"],
                subject="Test",
                content="<p>Hello</p>",
                **SMTP_CONFIG,
            )
        )


@patch("deepsel.utils.send_email.FastMail")
@patch("deepsel.utils.send_email.get_global_email_doser")
@patch("deepsel.utils.send_email.update_global_limits")
def test_bypass_rate_limit(mock_update, mock_get_doser, mock_fastmail):
    doser = EmailDoser(max_emails=1, per_seconds=3600)
    doser.record_send()  # exhaust limit
    mock_get_doser.return_value = doser

    mock_fm_instance = MagicMock()
    mock_fm_instance.send_message = AsyncMock()
    mock_fastmail.return_value = mock_fm_instance

    result = _run(
        send_email_with_limit(
            to=["recipient@example.com"],
            subject="Test",
            content="<p>Hello</p>",
            bypass_rate_limit=True,
            **SMTP_CONFIG,
        )
    )

    assert result["success"] is True
    # Doser count should not increase when bypassed
    usage = doser.get_current_usage()
    assert usage["current_count"] == 1


@patch("deepsel.utils.send_email.asyncio.sleep", new_callable=AsyncMock)
@patch("deepsel.utils.send_email.FastMail")
@patch("deepsel.utils.send_email.get_global_email_doser")
@patch("deepsel.utils.send_email.update_global_limits")
def test_smtp_failure(mock_update, mock_get_doser, mock_fastmail, mock_sleep):
    doser = EmailDoser(max_emails=200, per_seconds=3600)
    mock_get_doser.return_value = doser

    mock_fm_instance = MagicMock()
    mock_fm_instance.send_message = AsyncMock(
        side_effect=Exception("SMTP connection refused")
    )
    mock_fastmail.return_value = mock_fm_instance

    result = _run(
        send_email_with_limit(
            to=["recipient@example.com"],
            subject="Test",
            content="<p>Hello</p>",
            **SMTP_CONFIG,
        )
    )

    assert result["success"] is False
    assert "SMTP connection refused" in result["error"]


def test_retry_succeeds_on_second_attempt():
    mock_fm = MagicMock()
    mock_fm.send_message = AsyncMock(side_effect=[Exception("Temporary failure"), None])

    mock_message = MagicMock()

    result = _run(
        _try_send_email_with_retry(mock_fm, mock_message, max_retries=1, retry_delay=0)
    )

    assert result["success"] is True
    assert mock_fm.send_message.await_count == 2


def test_retry_exhausted():
    mock_fm = MagicMock()
    mock_fm.send_message = AsyncMock(side_effect=Exception("Persistent failure"))

    mock_message = MagicMock()

    result = _run(
        _try_send_email_with_retry(mock_fm, mock_message, max_retries=1, retry_delay=0)
    )

    assert result["success"] is False
    assert "Persistent failure" in result["error"]
    assert mock_fm.send_message.await_count == 2


# ---------------------------------------------------------------------------
# HB-3 — the retry delay must be configurable and must not block a request
# ---------------------------------------------------------------------------


class _FakeSettings:
    pass


def test_retry_config_defaults_are_short():
    """The old hard-coded 300 s was awaited inside the request that triggered
    the send, turning one bad SMTP credential into a five-minute hang."""
    with patch("deepsel.deps.settings", None):
        max_retries, retry_delay = _get_email_retry_config()
    assert max_retries == DEFAULT_EMAIL_MAX_RETRIES
    assert retry_delay == DEFAULT_EMAIL_RETRY_DELAY
    # Worst-case added latency stays in single-digit seconds.
    assert max_retries * retry_delay <= 10


def test_retry_config_reads_settings():
    settings = _FakeSettings()
    settings.EMAIL_MAX_RETRIES = 3
    settings.EMAIL_RETRY_DELAY = 0.5
    with patch("deepsel.deps.settings", settings):
        assert _get_email_retry_config() == (3, 0.5)


def test_retry_config_ignores_nonsense_values():
    settings = _FakeSettings()
    settings.EMAIL_MAX_RETRIES = "not-a-number"
    settings.EMAIL_RETRY_DELAY = -10
    with patch("deepsel.deps.settings", settings):
        max_retries, retry_delay = _get_email_retry_config()
    assert max_retries == DEFAULT_EMAIL_MAX_RETRIES
    assert retry_delay == 0.0


@patch("deepsel.utils.send_email.asyncio.sleep", new_callable=AsyncMock)
def test_retry_uses_the_configured_delay(mock_sleep):
    settings = _FakeSettings()
    settings.EMAIL_MAX_RETRIES = 1
    settings.EMAIL_RETRY_DELAY = 2

    mock_fm = MagicMock()
    mock_fm.send_message = AsyncMock(side_effect=Exception("Persistent failure"))

    with patch("deepsel.deps.settings", settings):
        result = _run(_try_send_email_with_retry(mock_fm, MagicMock()))

    assert result["success"] is False
    assert mock_fm.send_message.await_count == 2
    mock_sleep.assert_awaited_once_with(2.0)


@patch("deepsel.utils.send_email.asyncio.sleep", new_callable=AsyncMock)
def test_retries_can_be_turned_off(mock_sleep):
    settings = _FakeSettings()
    settings.EMAIL_MAX_RETRIES = 0

    mock_fm = MagicMock()
    mock_fm.send_message = AsyncMock(side_effect=Exception("Persistent failure"))

    with patch("deepsel.deps.settings", settings):
        result = _run(_try_send_email_with_retry(mock_fm, MagicMock()))

    assert result["success"] is False
    assert mock_fm.send_message.await_count == 1
    mock_sleep.assert_not_awaited()
