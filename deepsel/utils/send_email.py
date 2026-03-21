"""
Unified Email Sending Function with Rate Limiting

This module provides a centralized function for sending emails with built-in rate limiting
to prevent abuse and comply with email provider limits.

All email sending in the application should use this function to ensure consistent
rate limiting and logging.
"""

import logging
import asyncio
from typing import Optional, List, Dict, Any
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from pydantic import EmailStr

from deepsel.utils.email_doser import get_global_email_doser, update_global_limits

logger = logging.getLogger(__name__)


class EmailRateLimitError(Exception):
    """Raised when email sending is rate limited."""

    def __init__(self, message: str, next_available_seconds: float):
        super().__init__(message)
        self.next_available_seconds = next_available_seconds


async def send_email_with_limit(
    to: List[EmailStr],
    subject: str,
    content: str,
    mail_username: str,
    mail_password: str,
    mail_from: str,
    mail_from_name: str,
    mail_port: int,
    mail_server: str,
    mail_ssl_tls: bool = False,
    mail_starttls: bool = True,
    mail_use_credentials: bool = True,
    mail_validate_certs: bool = False,
    mail_timeout: int = 60,
    rate_limit_per_hour: int = 200,
    scope: str = "global",
    content_type: str = "html",
    bypass_rate_limit: bool = False,
) -> Dict[str, Any]:
    """
    Send an email with rate limiting.

    This is the unified function that ALL email sending in the application should use.
    It handles rate limiting, logging, error handling, and email tracking.

    Args:
        to: List of recipient email addresses
        subject: Email subject
        content: Email content (HTML or plain text)
        mail_username: SMTP username
        mail_password: SMTP password
        mail_from: Sender email address
        mail_from_name: Sender display name
        mail_port: SMTP port
        mail_server: SMTP server hostname
        mail_ssl_tls: Use SSL/TLS (default: False)
        mail_starttls: Use STARTTLS (default: True)
        mail_use_credentials: Use SMTP credentials (default: True)
        mail_validate_certs: Validate SSL certificates (default: False)
        mail_timeout: SMTP timeout in seconds (default: 60)
        rate_limit_per_hour: Maximum emails per hour, 0 for unlimited (default: 200)
        scope: Rate limiting scope (default: "global")
        content_type: Content type ("html" or "plain")
        bypass_rate_limit: Skip rate limiting (use carefully!)

    Returns:
        Dict with status, message, and optional error information

    Raises:
        EmailRateLimitError: When rate limit is exceeded
    """

    # Update global rate limits
    rate_limit = rate_limit_per_hour if rate_limit_per_hour is not None else 200

    # Update rate limits and get doser
    update_global_limits(rate_limit)
    doser = get_global_email_doser()

    # Check rate limiting unless bypassed
    if not bypass_rate_limit:
        if not doser.can_send_email(scope):
            next_available = doser.get_next_available_time(scope)
            error_msg = (
                f"Rate limit exceeded. Can send again in {next_available:.1f} seconds."
            )
            logger.warning(
                f"Email rate limit exceeded for scope '{scope}': {error_msg}"
            )
            raise EmailRateLimitError(error_msg, next_available)

    try:
        # Create message
        message = MessageSchema(
            subject=subject,
            recipients=to,
            body=content,
            subtype=content_type,
        )

        # Create connection configuration
        conf = ConnectionConfig(
            MAIL_USERNAME=mail_username,
            MAIL_PASSWORD=mail_password,
            MAIL_FROM=mail_from,
            MAIL_FROM_NAME=mail_from_name,
            MAIL_PORT=mail_port,
            MAIL_SERVER=mail_server,
            MAIL_SSL_TLS=mail_ssl_tls,
            MAIL_STARTTLS=mail_starttls,
            USE_CREDENTIALS=mail_use_credentials,
            VALIDATE_CERTS=mail_validate_certs,
            TIMEOUT=mail_timeout,
        )

        # Send email with retry logic
        fm = FastMail(conf)
        result = await _try_send_email_with_retry(fm, message)

        if result["success"]:
            if not bypass_rate_limit:
                doser.record_send(scope)

            return {
                "success": True,
                "status": "sent",
                "recipients_count": len(to),
            }
        else:
            logger.error(f"Failed to send email: {result['error']}")
            return {
                "success": False,
                "status": "failed",
                "error": result["error"],
            }

    except Exception as e:
        logger.error(f"Unexpected error sending email: {e}")
        return {
            "success": False,
            "status": "failed",
            "error": str(e),
        }


async def _try_send_email_with_retry(
    fm: FastMail,
    message: MessageSchema,
    max_retries: int = 1,
    retry_delay: int = 300,  # 5 minutes
) -> Dict[str, Any]:
    """
    Try to send email with retry logic.

    Args:
        fm: FastMail instance
        message: Email message to send
        max_retries: Maximum number of retries (default: 1)
        retry_delay: Delay between retries in seconds (default: 300)

    Returns:
        Dict with success status and optional error message
    """
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            await fm.send_message(message)
            return {"success": True}
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries:
                logger.warning(
                    f"Email send attempt {attempt + 1} failed: {e}. "
                    f"Retrying in {retry_delay} seconds..."
                )
                await asyncio.sleep(retry_delay)
            else:
                logger.error(
                    f"All {max_retries + 1} email send attempts failed. Last error: {e}"
                )

    return {"success": False, "error": last_error}


def get_current_rate_limit_status(scope: str = "global") -> Dict[str, Any]:
    """
    Get current rate limiting status for monitoring and debugging.

    Args:
        scope: Rate limiting scope (default: "global")

    Returns:
        Dict with current usage statistics
    """
    doser = get_global_email_doser()
    return doser.get_current_usage(scope)


def cleanup_rate_limiter():
    """
    Clean up expired rate limiting data.
    Should be called periodically (e.g., via cron job) to prevent memory leaks.
    """
    doser = get_global_email_doser()
    doser.cleanup_expired()
    logger.info("Rate limiter cleanup completed")
