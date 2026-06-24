import logging

from sqlalchemy import Column, Integer, Text

from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import ActivityMixin
from deepsel.utils.models_pool import models_pool
from sqlalchemy.orm import relationship

logger = logging.getLogger(__name__)


class TemplateModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "template"
    __tracked_fields__ = ["name", "published"]

    @classmethod
    def _get_activity_model(cls):
        try:
            ActivityModel = models_pool["activity"]
            ActivityType = ActivityModel.__table__.c["type"].type.enum_class
            return ActivityModel, ActivityType
        except Exception:
            logger.exception(
                "Failed to resolve ActivityModel/ActivityType from models_pool"
            )
            raise

    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    contents = relationship("TemplateContentModel", back_populates="template")
