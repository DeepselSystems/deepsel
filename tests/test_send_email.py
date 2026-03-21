import asyncio
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from deepsel.utils.email_doser import EmailDoser
from deepsel.utils.send_email import (
    send_email_with_limit,
    EmailRateLimitError,
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
