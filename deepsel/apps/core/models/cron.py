from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String
from deepsel.deps import Base
from deepsel.apps.core.mixins.orm import ORMBaseMixin
from deepsel.orm.cron_mixin import CronMixin, UnitInterval


class CronModel(Base, CronMixin, ORMBaseMixin):
    __tablename__ = "cron"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

    model = Column(String, nullable=False)
    method = Column(String, nullable=False)
    arguments = Column(String, default="[]")
    enabled = Column(Boolean, default=False)
    last_run = Column(DateTime)
    next_run = Column(DateTime, default=datetime.now())
    interval = Column(Integer, nullable=False, default=1)
    interval_unit = Column(
        Enum(UnitInterval), nullable=False, default=UnitInterval.days
    )
