from sqlalchemy import Column, Integer, Text
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import ActivityMixin
from sqlalchemy.orm import relationship


class TemplateModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "template"
    __tracked_fields__ = ["name", "published"]

    @classmethod
    def _get_activity_model(cls):
        from apps.core.models.activity import ActivityModel, ActivityType

        return ActivityModel, ActivityType

    id = Column(Integer, primary_key=True)
    name = Column(Text, nullable=False)
    contents = relationship("TemplateContentModel", back_populates="template")
