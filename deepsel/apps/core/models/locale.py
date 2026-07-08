from sqlalchemy import (
    Column,
    Integer,
    String,
)
from deepsel.deps import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin


class LocaleModel(Base, ORMBaseMixin):
    __tablename__ = "locale"

    id = Column(Integer, primary_key=True)

    name = Column(String, nullable=False)
    iso_code = Column(String, nullable=False)
