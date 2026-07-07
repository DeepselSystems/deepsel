from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from deepsel.apps.core.mixins.orm import ORMBaseMixin
from deepsel.deps import Base


class CountryModel(Base, ORMBaseMixin):
    __tablename__ = "country"

    id = Column(Integer, primary_key=True)

    name = Column(String, nullable=False)
    iso_code = Column(String, nullable=False, unique=True)
    phone_code = Column(String)

    currency_id = Column(Integer, ForeignKey("currency.id"))
    currency = relationship("CurrencyModel")
