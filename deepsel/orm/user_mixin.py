import json
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class UserMixin:
    """
    Mixin providing user authentication, role/permission resolution, and email methods.

    Concrete User model should inherit from `ORMBaseMixin` (NOT `BaseModel`), so it
    skips `OrganizationMetaDataMixin` and has no `organization_id`/`owner_id` column.
    Org membership lives exclusively in the `organizations` M2M relationship.

    Per-request "current org" context is supplied via the `X-Organization-Id` header
    (see `deepsel.auth.current_org.resolve_current_organization_id`) and attached as
    `user.current_organization_id` by the consumer's `get_current_user` dependency.

    Subclass must override:
        _get_app_secret() -> str
        _get_auth_algorithm() -> str
        _get_frontend_url() -> str
        _get_is_authless() -> bool
        _get_default_org_id() -> int
        _get_password_context() -> CryptContext
        _get_admin_role_string_ids() -> list[str]
        _get_admin_user_string_id() -> str
        _get_set_password_template_id() -> str
        _get_reset_password_template_id() -> str
        _get_email_verification_template_id() -> str
    """

    @classmethod
    def _get_app_secret(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_app_secret()")

    @classmethod
    def _get_auth_algorithm(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_auth_algorithm()")

    @classmethod
    def _get_frontend_url(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_frontend_url()")

    @classmethod
    def _get_is_authless(cls) -> bool:
        raise NotImplementedError("Subclass must implement _get_is_authless()")

    @classmethod
    def _get_default_org_id(cls) -> int:
        raise NotImplementedError("Subclass must implement _get_default_org_id()")

    @classmethod
    def _get_password_context(cls):
        raise NotImplementedError("Subclass must implement _get_password_context()")

    @classmethod
    def _get_admin_role_string_ids(cls) -> list[str]:
        raise NotImplementedError(
            "Subclass must implement _get_admin_role_string_ids()"
        )

    @classmethod
    def _get_admin_user_string_id(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_admin_user_string_id()")

    @classmethod
    def _get_set_password_template_id(cls) -> str:
        raise NotImplementedError(
            "Subclass must implement _get_set_password_template_id()"
        )

    @classmethod
    def _get_reset_password_template_id(cls) -> str:
        raise NotImplementedError(
            "Subclass must implement _get_reset_password_template_id()"
        )

    def get_org_ids(self):
        return [org.id for org in self.organizations]

    def check_and_raise_if_not_admin_or_super_admin(self):
        if not any(
            role.string_id in self._get_admin_role_string_ids() for role in self.roles
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin or super admin can update user",
            )

    def is_admin(self):
        roles = self.get_user_roles()
        return any(
            [role.string_id in ["admin_role", "super_admin_role"] for role in roles]
        )

    def _get_roles_recursively(self, role, processed_roles: list = None) -> set:
        if processed_roles is None:
            processed_roles = set()

        if role in processed_roles:
            return set()

        processed_roles.add(role)

        roles = set()
        roles.add(role)

        for implied_role in role.implied_roles:
            roles.update(self._get_roles_recursively(implied_role, processed_roles))

        return roles

    def _get_permissions_recursively(
        self, role, processed_roles: list = None
    ) -> set[str]:
        if processed_roles is None:
            processed_roles = set()

        if role in processed_roles:
            return set()

        processed_roles.add(role)

        permissions = set()
        if role.permissions:
            these_permissions = json.loads(role.permissions)
            for permission in these_permissions:
                permissions.add(permission)

        for implied_role in role.implied_roles:
            permissions.update(
                self._get_permissions_recursively(implied_role, processed_roles)
            )

        return permissions

    def get_user_permissions(self, user: "UserMixin" = None) -> list[str]:
        user = user or self
        roles = user.roles
        permissions = set()

        for role in roles:
            permissions.update(self._get_permissions_recursively(role))

        return list(permissions)

    def get_user_roles(self, user: "UserMixin" = None) -> list:
        user = user or self
        roles = user.roles
        all_roles = set()

        for role in roles:
            all_roles.update(self._get_roles_recursively(role))

        return list(all_roles)

    @classmethod
    def get_user_has_roles(cls, role_string_ids: list[str], db: Session):
        from deepsel.utils.models_pool import models_pool

        ImpliedRoleModel = models_pool["implied_role"]
        UserRoleModel = models_pool["user_role"]
        RoleModel = models_pool["role"]

        roles = (
            db.query(RoleModel).filter(RoleModel.string_id.in_(role_string_ids)).all()
        )
        role_ids = [role.id for role in roles]
        main_roles = (
            db.query(ImpliedRoleModel)
            .filter(ImpliedRoleModel.implied_role_id.in_(role_ids))
            .all()
        )
        role_ids += [role.role_id for role in main_roles]
        users = (
            db.query(cls)
            .join(UserRoleModel)
            .filter(UserRoleModel.role_id.in_(list(set(role_ids))))
        ).all()
        return users

    async def send_set_password_email(self, db: Session, organization_id: int):
        import jwt

        from deepsel.utils.models_pool import models_pool

        EmailTemplateModel = models_pool["email_template"]
        OrganizationModel = models_pool["organization"]
        org = db.query(OrganizationModel).get(organization_id)
        token = jwt.encode(
            {
                "uid": self.id,
                "org_id": organization_id,
                "exp": datetime.now(UTC) + timedelta(days=7),
            },
            self._get_app_secret(),
            algorithm=self._get_auth_algorithm(),
        )
        context = {
            "name": self.name or self.email or self.username,
            "username": self.email or self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "action_url": self._get_frontend_url() + "/reset-password?t=" + token,
            "business_name": org.name if org else "",
        }

        template = (
            db.query(EmailTemplateModel)
            .filter_by(string_id=self._get_set_password_template_id())
            .first()
        )
        ok = await template.send(db, [self.email], context)
        if not ok:
            logger.error(f"Failed to send password setup email to {self.email}")
        else:
            logger.info(f"Password setup email sent to {self.email}")
        return ok

    async def email_reset_password(self, db: Session, organization_id: int):
        import jwt

        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]
        org = db.query(OrganizationModel).get(organization_id)

        token = jwt.encode(
            {
                "uid": self.id,
                "org_id": organization_id,
                "exp": datetime.now(UTC) + timedelta(hours=24),
            },
            self._get_app_secret(),
            algorithm=self._get_auth_algorithm(),
        )

        context = {
            "name": self.name or self.email or self.username,
            "username": self.email or self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "action_url": self._get_frontend_url() + "/reset-password" + "?t=" + token,
            "business_name": org.name if org else "",
        }

        EmailTemplateModel = models_pool["email_template"]
        template = (
            db.query(EmailTemplateModel)
            .filter_by(string_id=self._get_reset_password_template_id())
            .first()
        )
        ok = await template.send(db, [self.email], context)
        return ok

    @classmethod
    def _get_email_verification_template_id(cls) -> str:
        raise NotImplementedError(
            "Subclass must implement _get_email_verification_template_id()"
        )

    async def send_email_verification_code(
        self, db: Session, organization_id: int
    ) -> bool:
        """Generate a 6-digit confirmation code, store its hash on the user, and
        email it via the given org's template + SMTP config (the platform org for
        SaaS signups). Falls back to logging the code when mail is unconfigured,
        so dev environments stay usable."""
        import secrets

        from deepsel.utils.models_pool import models_pool

        code = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(UTC).replace(tzinfo=None)
        self.email_verification_code = self._get_password_context().hash(code)
        self.email_verification_code_expires = now + timedelta(minutes=10)
        self.email_verification_sent_at = now
        self.email_verification_attempts = 0
        db.commit()

        OrganizationModel = models_pool["organization"]
        EmailTemplateModel = models_pool["email_template"]
        org = db.query(OrganizationModel).get(organization_id)
        template = (
            db.query(EmailTemplateModel)
            .filter_by(
                string_id=self._get_email_verification_template_id(),
                organization_id=organization_id,
            )
            .first()
        )
        if template is None or not org or not org.is_smtp_configured:
            logger.warning(
                f"[DEV fallback] Email verification code for {self.email}: {code}"
            )
            return True

        context = {
            "name": self.name or self.email or self.username,
            "username": self.email or self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "code": code,
            "business_name": org.name if org else "",
        }
        ok = await template.send(db, [self.email], context)
        if not ok:
            logger.error(f"Failed to send email verification code to {self.email}")
        return ok

    def check_email_verification_code(self, db: Session, code: str) -> bool:
        """Validate a submitted confirmation code. Raises on expiry/attempt
        exhaustion so callers can surface distinct errors; returns False on a
        plain wrong code."""
        if self.email_verified:
            return True
        now = datetime.now(UTC).replace(tzinfo=None)
        if (
            not self.email_verification_code
            or not self.email_verification_code_expires
            or now > self.email_verification_code_expires
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="code_expired"
            )
        if (self.email_verification_attempts or 0) >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too_many_attempts",
            )
        # count the attempt before verifying so failed tries always consume one
        self.email_verification_attempts = (self.email_verification_attempts or 0) + 1
        db.commit()
        if not self._get_password_context().verify(code, self.email_verification_code):
            return False
        self.email_verified = True
        self.email_verification_code = None
        self.email_verification_code_expires = None
        self.email_verification_attempts = 0
        db.commit()
        return True

    @classmethod
    def authenticate_user(cls, db: Session, identifier: str, password: str):
        from deepsel.utils.models_pool import models_pool

        OrgModel = models_pool["organization"]
        default_org_id = cls._get_default_org_id()
        org = db.query(OrgModel).get(default_org_id)
        if cls._get_is_authless() and org and not org.enable_auth:
            user = (
                db.query(cls)
                .filter_by(
                    string_id=cls._get_admin_user_string_id(),
                )
                .first()
            )
            return user
        if not identifier:
            return False
        user = (
            db.query(cls)
            .filter(or_(cls.email == identifier, cls.username == identifier))
            .filter(cls.active == True)  # noqa: E712
            .first()
        )
        if not user:
            return False
        if not cls._get_password_context().verify(password, user.hashed_password):
            return False
        # getattr default keeps consumers whose user model lacks the column working
        if getattr(user, "email_verified", True) is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="email_not_verified"
            )
        return user
