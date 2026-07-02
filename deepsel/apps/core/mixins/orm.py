import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from deepsel.orm.mixin import ORMBaseMixin as _ORMBaseMixin
from deepsel.orm.types import PermissionAction, PermissionScope

logger = logging.getLogger(__name__)


class ORMBaseMixin(_ORMBaseMixin):
    """CMS-specific ORMBaseMixin with organization resolution on create."""

    @classmethod
    def _resolve_organization_on_create(
        cls,
        db: Session,
        user,
        values: dict,
        bypass_permission: Optional[bool] = False,
    ) -> dict:
        if not hasattr(cls, "organization_id"):
            return values

        if cls.__tablename__ == "user":
            return values

        # When bypassing permission checks, organization_id is already resolved by the caller
        if bypass_permission:
            return values

        [_, scope] = cls._check_has_permission(PermissionAction.create, user)
        requested_org_id = values.get("organization_id")

        if scope == PermissionScope.all:
            return values

        if scope == PermissionScope.org:
            user_org_ids = user.get_org_ids()
            if requested_org_id and requested_org_id in user_org_ids:
                return values

        current_org_id = getattr(user, "current_organization_id", None)
        if current_org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"X-Organization-Id header required to create {cls.__tablename__}"
                ),
            )
        values["organization_id"] = current_org_id
        return values
