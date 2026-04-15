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
        org_ids = [org.id for org in self.organizations]
        if self.organization_id:
            org_ids.append(self.organization_id)
        return org_ids

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

    async def send_set_password_email(self, db: Session):
        import jwt

        from deepsel.utils.models_pool import models_pool

        EmailTemplateModel = models_pool["email_template"]
        OrganizationModel = models_pool["organization"]
        org = db.query(OrganizationModel).get(self.organization_id)
        token = jwt.encode(
            {"uid": self.id},
            self._get_app_secret(),
            algorithm=self._get_auth_algorithm(),
        )
        context = {
            "name": self.name or self.email or self.username,
            "username": self.email or self.username,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "action_url": self._get_frontend_url() + "?t=" + token,
            "business_name": org.name,
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

    async def email_reset_password(self, db: Session):
        import jwt

        from deepsel.utils.models_pool import models_pool

        token = jwt.encode(
            {
                "uid": self.id,
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
            "business_name": self.organization.name,
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
        return user
