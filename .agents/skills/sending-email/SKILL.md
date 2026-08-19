---
name: sending-email
description: Send emails from the backend using the unified rate-limited email function. Use when writing code that sends emails
argument-hint: (no arguments)
---

# Sending Emails

Guide for writing backend code that sends emails with built-in rate limiting.

## When to Use

- Writing code that sends emails (notifications, welcome emails, alerts, etc.)
- Migrating legacy `FastMail` usage to the unified function
- Troubleshooting email rate limiting or delivery issues

## Critical Rule

**ALL email sending MUST use `send_email_with_limit()`.** Never use FastMail directly.

```python
# CORRECT
from deepsel.utils.send_email import send_email_with_limit, EmailRateLimitError

# WRONG - never do this
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
```

## Function Signature

```python
async def send_email_with_limit(
    db: Session,
    to: List[EmailStr],
    subject: str,
    content: str,
    organization_id: int = 1,
    scope: str = "global",
    template_context: Optional[Dict[str, Any]] = None,
    content_type: str = "html",
    bypass_rate_limit: bool = False,
) -> Dict[str, Any]
```

**Parameters:**
- `db` — Database session
- `to` — List of recipient email addresses
- `subject` — Email subject line
- `content` — Email body (HTML or plain text)
- `organization_id` — Organization for SMTP settings (default: 1)
- `scope` — Rate limiting scope (default: `"global"`)
- `content_type` — `"html"` or `"plain"`
- `bypass_rate_limit` — Skip rate limiting (use with extreme caution)

**Returns:**
```python
{
    "success": bool,
    "status": str,            # "sent" or "failed"
    "email_id": int,          # Database record ID
    "recipients_count": int,  # On success
    "error": str              # On failure
}
```

**Raises:** `EmailRateLimitError` when rate limit exceeded (has `.next_available_seconds` attribute).

## Required Pattern

Always handle `EmailRateLimitError`:

```python
from deepsel.utils.send_email import send_email_with_limit, EmailRateLimitError

async def send_notification(db: Session, recipients: List[str], message: str):
    try:
        result = await send_email_with_limit(
            db=db,
            to=recipients,
            subject="Notification",
            content=message
        )
        if result["success"]:
            logger.info(f"Email sent. ID: {result['email_id']}")
        else:
            logger.error(f"Email failed: {result['error']}")
    except EmailRateLimitError as e:
        logger.warning(f"Rate limited: {e}. Retry in {e.next_available_seconds}s")
```

## Template-Based Emails

When using `EmailTemplateModel`:

```python
from jinja2 import Template

async def send_template_email(self, db: Session, to: List[EmailStr], context: dict):
    template = Template(self.content)
    rendered_content = template.render(**context)
    subject_template = Template(self.subject)
    rendered_subject = subject_template.render(**context)

    try:
        result = await send_email_with_limit(
            db=db, to=to,
            subject=rendered_subject,
            content=rendered_content,
            organization_id=self.organization_id
        )
        return result["success"]
    except EmailRateLimitError:
        return False
```

## Rate Limiting

- Configured per organization: `mail_send_rate_limit_per_hour` field (default: 200)
- Uses sliding window algorithm per hour
- Currently uses `scope="global"` (future: `"user:{id}"`, `"campaign:{id}"`, `"ip:{ip}"`)
- Set to 0 for unlimited (not recommended)

## Monitoring

```python
from deepsel.utils.send_email import get_current_rate_limit_status, cleanup_rate_limiter

# Check usage
status = get_current_rate_limit_status("global")
# → {"current_count": N, "max_emails": N, "next_available_seconds": N}

# Cleanup expired data (periodic maintenance)
cleanup_rate_limiter()
```

## Checklist

When writing email-sending code:
1. Import `send_email_with_limit` and `EmailRateLimitError`
2. Always `await` the call (it's async)
3. Always handle `EmailRateLimitError`
4. Log success and failure
5. Never use FastMail directly
6. Never bypass rate limiting without good reason
