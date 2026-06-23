from sqlalchemy import Column, Integer, String, ForeignKey
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship


class PageContentRevisionModel(Base, BaseModel):
    __tablename__ = "page_content_revision"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)
    revision_number = Column(
        Integer, nullable=True
    )  # Sequential number for this content

    page_content_id = Column(
        Integer,
        ForeignKey("page_content.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_content = relationship("PageContentModel", foreign_keys=[page_content_id])
    owner = relationship(
        "UserModel", foreign_keys="PageContentRevisionModel.owner_id", lazy="joined"
    )

    old_content = Column(String)
    new_content = Column(String)
