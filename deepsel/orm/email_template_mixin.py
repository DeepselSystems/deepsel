import logging
from asyncio import sleep
from collections.abc import Mapping
from typing import Any, Optional

from sqlalchemy.orm import Session

from deepsel.utils.send_email import send_email_with_limit, EmailRateLimitError

logger = logging.getLogger(__name__)


_INERT_PRIMITIVE_TYPES = (str, int, float, bool, bytes, type(None))


def _to_inert_template_value(value: Any, seen_ids: set[int]) -> Any:
    """Convert template-context values into inert data-only structures.

    Jinja's sandbox allows calling public callables by default. If an
    untrusted template receives rich Python objects in context, expressions
    like ``{{ obj.delete_everything() }}`` can invoke side-effecting methods.
    This converter strips callables and turns objects into plain mappings so
    templates can read data but cannot call object methods.
    """
    if isinstance(value, _INERT_PRIMITIVE_TYPES):
        return value
    if callable(value):
        return str(value)

    value_id = id(value)
    if value_id in seen_ids:
        return "<recursive>"

    seen_ids.add(value_id)
    try:
        if isinstance(value, Mapping):
            sanitized_mapping = {}
            for key, nested_value in value.items():
                if callable(nested_value):
                    continue
                sanitized_mapping[str(key)] = _to_inert_template_value(
                    nested_value, seen_ids
                )
            return sanitized_mapping

        if isinstance(value, list):
            return [_to_inert_template_value(item, seen_ids) for item in value]

        if isinstance(value, tuple):
            return tuple(_to_inert_template_value(item, seen_ids) for item in value)

        if isinstance(value, (set, frozenset)):
            return [_to_inert_template_value(item, seen_ids) for item in value]

        if hasattr(value, "__dict__"):
            sanitized_object = {}
            for attr_name, attr_value in vars(value).items():
                if attr_name.startswith("_") or callable(attr_value):
                    continue
                sanitized_object[attr_name] = _to_inert_template_value(
                    attr_value, seen_ids
                )
            return sanitized_object

        return str(value)
    finally:
        seen_ids.remove(value_id)


def _sanitize_template_context(context: dict[str, Any]) -> dict[str, Any]:
    """Return a data-only copy of `context` safe for untrusted templates."""
    return {
        str(key): _to_inert_template_value(value, set())
        for key, value in context.items()
        if not callable(value)
    }


def _smtp_ready(org: Any) -> bool:
    """Same rule as ``OrganizationModel.is_smtp_configured``, computed from the
    columns so any org-shaped object (including test doubles) qualifies."""
    return bool(
        org is not None
        and getattr(org, "mail_server", None)
        and getattr(org, "mail_from", None)
    )


class EmailTemplateMixin:
    """
    Mixin providing email template rendering and sending.

    Subclass must override:
        _get_organization_model() -> type
        _get_super_org_string_id() -> str

    SMTP resolution in ``send()``: the template's own organization is used when
    it has a mail server and a from address; otherwise the platform organization
    (``settings.DEFAULT_ORG_ID``, falling back to the org whose ``string_id`` is
    ``_get_super_org_string_id()``) is used. Tenant organizations in a SaaS
    deployment usually have no SMTP of their own, and their per-org template
    copies would otherwise fail on a NULL host.
    """

    @classmethod
    def _get_organization_model(cls):
        raise NotImplementedError("Subclass must implement _get_organization_model()")

    @classmethod
    def _get_super_org_string_id(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_super_org_string_id()")

    @classmethod
    def _resolve_mail_org(cls, db: Session, org: Any) -> Any:
        """Return the organization whose SMTP settings carry the message.

        ``org`` (the template's own organization) wins when it is configured.
        Otherwise the platform organization is used when *it* is configured.
        Returns ``None`` when neither can send.
        """
        if _smtp_ready(org):
            return org

        from deepsel import deps

        OrganizationModel = cls._get_organization_model()
        platform = None
        platform_id = getattr(getattr(deps, "settings", None), "DEFAULT_ORG_ID", None)
        if platform_id is not None:
            if org is not None and getattr(org, "id", None) == platform_id:
                platform = org
            else:
                platform = db.query(OrganizationModel).get(platform_id)
        if platform is None:
            platform = (
                db.query(OrganizationModel)
                .filter_by(string_id=cls._get_super_org_string_id())
                .first()
            )
        return platform if _smtp_ready(platform) else None

    async def send(
        self,
        db: Session,
        to: list,
        context: dict,
        subject: Optional[str] = None,
        *,
        from_name: Optional[str] = None,
        reply_to: Optional[list] = None,
    ) -> bool:
        """Render and send this template.

        ``from_name`` replaces the sending organization's ``mail_from_name``
        (e.g. a tenant's shop name when the mail goes out through the platform
        SMTP); ``reply_to`` sets the Reply-To header.
        """
        from deepsel.utils.jinja2_sandbox import (
            ResourceLimitedSandboxedEnvironment,
            render_with_output_limit,
        )

        try:
            safe_context = _sanitize_template_context(context)

            # Sandboxed because `self.content`/`self.subject` are
            # user-authored email templates — a plain Template would give
            # them full access to Python internals (SSTI/RCE).
            # ResourceLimitedSandboxedEnvironment + render_with_output_limit
            # also cap CPU/memory-bomb expressions (`"x" * 10**9`) that pure
            # object-traversal sandboxing doesn't address — see
            # deepsel/utils/jinja2_sandbox.py. A fresh environment per
            # render: the iteration budget is per-instance state, so
            # rendering both templates through one shared instance would let
            # content's usage eat into subject's budget.
            template = ResourceLimitedSandboxedEnvironment().from_string(self.content)
            rendered_template = render_with_output_limit(template, safe_context)

            subject_template = ResourceLimitedSandboxedEnvironment().from_string(
                self.subject
            )
            rendered_subject = render_with_output_limit(subject_template, safe_context)

            final_subject = subject or rendered_subject

            OrganizationModel = self._get_organization_model()
            org = db.query(OrganizationModel).get(self.organization_id)
            if not org:
                logger.error(f"Organization {self.organization_id} not found")
                return False

            mail_org = self._resolve_mail_org(db, org)
            if mail_org is None:
                logger.warning(
                    "No SMTP configured for organization %s or the platform "
                    "organization; email template %s not sent",
                    self.organization_id,
                    getattr(self, "string_id", None) or getattr(self, "name", "?"),
                )
                return False

            rate_limit = getattr(mail_org, "mail_send_rate_limit_per_hour", 200)
            if rate_limit is None:
                rate_limit = 200

            result = await send_email_with_limit(
                to=to,
                subject=final_subject,
                content=rendered_template,
                mail_username=mail_org.mail_username,
                mail_password=mail_org.mail_password,
                mail_from=mail_org.mail_from,
                mail_from_name=from_name or mail_org.mail_from_name,
                mail_port=mail_org.mail_port,
                mail_server=mail_org.mail_server,
                mail_ssl_tls=mail_org.mail_ssl_tls,
                mail_starttls=mail_org.mail_starttls,
                mail_use_credentials=mail_org.mail_use_credentials,
                mail_validate_certs=mail_org.mail_validate_certs,
                mail_timeout=getattr(mail_org, "mail_timeout", 60),
                rate_limit_per_hour=rate_limit,
                content_type="html",
                reply_to=reply_to,
            )

            return result["success"]

        except EmailRateLimitError as e:
            logger.warning(f"Email template send rate limited: {e}")
            return False
        except Exception as e:
            logger.error(f"Error sending email template: {e}")
            return False

    @classmethod
    async def send_common_notify_to_user_roles(
        cls,
        db: Session,
        to_user_has_roles: list[str],
        subject: str,
        text: str,
        btn_text: str,
        action_url: str,
    ):
        from deepsel.utils.models_pool import models_pool

        print("send_common_notify_to_user_roles")
        UserModel = models_pool["user"]
        Model = models_pool[cls.__tablename__]
        to_users = UserModel.get_user_has_roles(to_user_has_roles, db)
        if not to_users:
            return
        to_emails = [user.email for user in to_users if user.email]
        if not to_emails:
            return
        common_notify_template = (
            db.query(Model).filter(Model.string_id == "common_notify_template").one()
        )
        if not common_notify_template:
            logger.info("The common_notify_template doesn't exist")
            return

        from pydantic import EmailStr

        context = {"text": text, "cta_action_url": action_url, "cta_btn_text": btn_text}
        return await common_notify_template.send(
            db=db,
            to=[EmailStr._validate(email) for email in list(set(to_emails))],
            context=context,
            subject=subject,
        )

    @classmethod
    async def find_good_config(
        cls, db: Session, test_recipient=None, sleep_interval=0
    ) -> str:
        """
        Test all combinations of the 4 boolean configs with a delay to prevent overload.
        """
        import itertools

        if test_recipient is None:
            test_recipient = "dev@deepsel.com"

        options = [True, False]
        combinations = list(itertools.product(options, repeat=4))
        logger.info(f"Testing {len(combinations)} combinations")

        results = []
        for combination in combinations:
            MAIL_SSL_TLS, MAIL_STARTTLS, USE_CREDENTIALS, VALIDATE_CERTS = combination
            result = await cls.test_config(
                db=db,
                test_recipient=test_recipient,
                MAIL_SSL_TLS=MAIL_SSL_TLS,
                MAIL_STARTTLS=MAIL_STARTTLS,
                USE_CREDENTIALS=USE_CREDENTIALS,
                VALIDATE_CERTS=VALIDATE_CERTS,
            )
            results.append(result)
            await sleep(sleep_interval)

        logger.info(f"Found {len(results)} results")
        return "\n\n".join(results)

    @classmethod
    async def test_config(
        cls,
        db: Session,
        test_recipient,
        MAIL_SSL_TLS: bool,
        MAIL_STARTTLS: bool,
        USE_CREDENTIALS: bool,
        VALIDATE_CERTS: bool,
    ) -> str:
        """
        Test the given configuration using direct FastMail (bypasses rate limiting for testing)
        """
        from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

        OrganizationModel = cls._get_organization_model()
        super_org = (
            db.query(OrganizationModel)
            .filter_by(string_id=cls._get_super_org_string_id())
            .first()
        )
        try:
            message = MessageSchema(
                subject="SMTP Configuration Test",
                recipients=[test_recipient],
                body=f"Configuration test: MAIL_SSL_TLS={MAIL_SSL_TLS}, MAIL_STARTTLS={MAIL_STARTTLS}, USE_CREDENTIALS={USE_CREDENTIALS}, VALIDATE_CERTS={VALIDATE_CERTS}",
                subtype=MessageType.html,
            )
            conf = ConnectionConfig(
                MAIL_USERNAME=super_org.mail_username,
                MAIL_PASSWORD=super_org.mail_password,
                MAIL_FROM=super_org.mail_from,
                MAIL_FROM_NAME=super_org.mail_from_name,
                MAIL_PORT=int(super_org.mail_port),
                MAIL_SERVER=super_org.mail_server,
                MAIL_SSL_TLS=MAIL_SSL_TLS,
                MAIL_STARTTLS=MAIL_STARTTLS,
                USE_CREDENTIALS=USE_CREDENTIALS,
                VALIDATE_CERTS=VALIDATE_CERTS,
                TIMEOUT=super_org.mail_timeout,
            )
            fm = FastMail(conf)
            await fm.send_message(message)
            logger.info(f"SMTP configuration test successful to {test_recipient}")
            return f"\n✅ Successful configuration: MAIL_SSL_TLS={MAIL_SSL_TLS}, MAIL_STARTTLS={MAIL_STARTTLS}, USE_CREDENTIALS={USE_CREDENTIALS}, VALIDATE_CERTS={VALIDATE_CERTS}"
        except Exception as e:
            return f"\n❌ Failed configuration: MAIL_SSL_TLS={MAIL_SSL_TLS}, MAIL_STARTTLS={MAIL_STARTTLS}, USE_CREDENTIALS={USE_CREDENTIALS}, VALIDATE_CERTS={VALIDATE_CERTS}. Error: {e}"
