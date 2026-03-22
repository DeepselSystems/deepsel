import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class OrganizationMixin:
    """
    Mixin providing organization public settings and update logic.

    Subclass must override:
        _get_default_org_id() -> int
        _get_is_authless() -> bool
        _get_public_settings_fields() -> list[str]
        _get_protected_api_key_fields() -> list[str]
        _get_admin_role_string_ids() -> list[str]
    """

    @classmethod
    def _get_default_org_id(cls) -> int:
        raise NotImplementedError("Subclass must implement _get_default_org_id()")

    @classmethod
    def _get_is_authless(cls) -> bool:
        raise NotImplementedError("Subclass must implement _get_is_authless()")

    @classmethod
    def _get_public_settings_fields(cls) -> list[str]:
        raise NotImplementedError(
            "Subclass must implement _get_public_settings_fields()"
        )

    @classmethod
    def _get_protected_api_key_fields(cls) -> list[str]:
        raise NotImplementedError(
            "Subclass must implement _get_protected_api_key_fields()"
        )

    @classmethod
    def _get_admin_role_string_ids(cls) -> list[str]:
        raise NotImplementedError(
            "Subclass must implement _get_admin_role_string_ids()"
        )

    @classmethod
    def get_public_settings(cls, organization_id: int, db: Session):
        organization = db.query(cls).get(organization_id)
        default_org = db.query(cls).get(cls._get_default_org_id())
        if not organization:
            raise HTTPException(status_code=404, detail="Organization not found")

        result = {}
        for field in cls._get_public_settings_fields():
            result[field] = getattr(organization, field)

        result["authless"] = not default_org.enable_auth and cls._get_is_authless()
        return result

    @classmethod
    def get_one(cls, db: Session, user, item_id: int, *args, **kwargs):
        org = super().get_one(db, user, item_id, *args, **kwargs)
        user_roles = user.get_user_roles()
        is_admin = any(
            [role.string_id in cls._get_admin_role_string_ids() for role in user_roles]
        )

        if is_admin:
            return org
        else:
            return cls.get_public_settings(org.id, db)

    def update(
        self,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ):
        """
        Update while preserving existing secret values.

        If a secret value is not provided in the values dict, the existing value
        from the organization will be retained to prevent accidental key deletion.
        """
        organization = db.query(self.__class__).get(self.id)

        for key in self._get_protected_api_key_fields():
            if not values.get(key):
                values[key] = getattr(organization, key)

        return super().update(db, user, values, commit, *args, **kwargs)
