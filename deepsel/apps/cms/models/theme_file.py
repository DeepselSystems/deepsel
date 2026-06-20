from sqlalchemy import Column, ForeignKey, Integer, Text, String, UniqueConstraint
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import ActivityMixin
from sqlalchemy.orm import relationship


class ThemeFileModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "theme_file"
    __tracked_fields__ = ["theme_name", "file_path"]
    __table_args__ = (
        UniqueConstraint(
            "theme_name", "file_path", "organization_id", name="uq_theme_file_org"
        ),
    )

    @classmethod
    def _get_activity_model(cls):
        from apps.core.models.activity import ActivityModel, ActivityType

        return ActivityModel, ActivityType

    id = Column(Integer, primary_key=True)
    theme_name = Column(String(255), nullable=False)  # e.g., "starter_react"
    file_path = Column(Text, nullable=False)  # e.g., "components/Header.tsx"
    organization_id = Column(
        Integer, ForeignKey("organization.id"), nullable=False, index=True
    )
    contents = relationship(
        "ThemeFileContentModel",
        back_populates="theme_file",
        cascade="all, delete-orphan",
    )
