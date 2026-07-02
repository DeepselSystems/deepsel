from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from db import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    description = Column(Text)
    permissions = Column(
        String
    )  # format: 'table:action:scope' eg. 'invoice:read:org', 'invoice:*:org'
    organization_id = Column(Integer, ForeignKey("organization.id"), nullable=False)
    implied_roles = relationship(
        "RoleModel",
        secondary="implied_role",
        primaryjoin="RoleModel.id==ImpliedRoleModel.role_id",
        secondaryjoin="RoleModel.id==ImpliedRoleModel.implied_role_id",
    )
