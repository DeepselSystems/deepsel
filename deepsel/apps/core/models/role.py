import logging
from typing import Optional

from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from deepsel import deps
from deepsel.deps import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin

logger = logging.getLogger(__name__)

# SB-22: `admin_role` grants `*` scope — it reads and writes across every
# organization in the deployment. Seeding it into each tenant (which the
# all-orgs seed loop and `install_seed_data_for_org` both used to do) handed
# every self-serve owner a role they could assign to anyone, and any consumer
# app that re-imports `admin_role` in its own role.csv widened the same hole.
# It belongs to the platform organization only. Override the list per
# deployment with `PLATFORM_ONLY_ROLE_STRING_IDS` in the settings module.
DEFAULT_PLATFORM_ONLY_ROLE_STRING_IDS = ("admin_role",)


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    description = Column(Text)
    permissions = Column(
        String
    )  # format: 'table:action:scope' eg. 'invoice:read:org', 'invoice:*:org'
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=False)
    organization = relationship("OrganizationModel", lazy="selectin")
    implied_roles = relationship(
        "RoleModel",
        secondary="implied_role",
        primaryjoin="RoleModel.id==ImpliedRoleModel.role_id",
        secondaryjoin="RoleModel.id==ImpliedRoleModel.implied_role_id",
    )

    @classmethod
    def _get_platform_only_role_string_ids(cls) -> tuple:
        configured = getattr(deps.settings, "PLATFORM_ONLY_ROLE_STRING_IDS", None)
        if configured is None:
            return DEFAULT_PLATFORM_ONLY_ROLE_STRING_IDS
        return tuple(configured)

    @classmethod
    def _is_seed_row_allowed_for_org(
        cls, row: dict, organization_id: Optional[int]
    ) -> bool:
        """Keep cross-org roles out of tenant organizations (SB-22)."""
        string_id = row.get("string_id")
        if string_id not in cls._get_platform_only_role_string_ids():
            return True

        platform_org_id = getattr(deps.settings, "DEFAULT_ORG_ID", None)
        if platform_org_id is None or organization_id is None:
            # Nothing to compare against — keep the historical behaviour rather
            # than silently dropping the deployment's only admin role.
            return True

        allowed = int(organization_id) == int(platform_org_id)
        if not allowed:
            logger.info(
                f"Skipping platform-only role '{string_id}' for organization "
                f"{organization_id}; it is seeded into organization "
                f"{platform_org_id} only."
            )
        return allowed
