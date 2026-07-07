from sqlalchemy import Column, ForeignKey, Integer
from deepsel.deps import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin


class UserOrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "user_organization"

    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, primary_key=True)
    organization_id = Column(
        Integer, ForeignKey("organization.id"), nullable=False, primary_key=True
    )
