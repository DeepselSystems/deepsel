from sqlalchemy import Column, Integer, String, ForeignKey, Text
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship


class BlogPostContentRevisionModel(Base, BaseModel):
    __tablename__ = "blog_post_content_revision"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=True)
    revision_number = Column(
        Integer, nullable=True
    )  # Sequential number for this content

    blog_post_content_id = Column(
        Integer,
        ForeignKey("blog_post_content.id", ondelete="CASCADE"),
        nullable=False,
    )
    blog_post_content = relationship(
        "BlogPostContentModel", foreign_keys=[blog_post_content_id]
    )
    owner = relationship(
        "UserModel", foreign_keys="BlogPostContentRevisionModel.owner_id", lazy="joined"
    )

    old_content = Column(Text)
    new_content = Column(Text)
