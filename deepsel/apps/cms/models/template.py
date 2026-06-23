from sqlalchemy import Column, Integer, Text

from deepsel.apps.cms.types.activity import ActivityType
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import ActivityMixin
from deepsel.utils.models_pool import models_pool
from sqlalchemy.orm import relationship


class TemplateModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "template"
    __tracked_fields__ = ["name", "published"]

    @classmethod
    def _get_activity_model(cls):
        ActivityModel = models_pool["activity"]

        return ActivityModel, ActivityType

    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    contents = relationship("TemplateContentModel", back_populates="template")
