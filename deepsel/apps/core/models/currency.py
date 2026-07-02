from sqlalchemy import Column, Integer, String
from db import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin


class CurrencyModel(Base, ORMBaseMixin):
    __tablename__ = "currency"

    id = Column(Integer, primary_key=True)

    name = Column(String, nullable=False)
    iso_code = Column(String, nullable=False, unique=True)
    symbol = Column(String)
