from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    Boolean,
    DateTime,
    Index,
    text as sa_text,
)
from deepsel.apps.cms.utils.tsvector import TSVector
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship, Session
from typing import Optional


class BlogPostContentModel(Base, BaseModel):
    __tablename__ = "blog_post_content"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    subtitle = Column(Text)
    content = Column(Text)
    reading_length = Column(String)

    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=False)
    locale = relationship("LocaleModel")

    post_id = Column(Integer, ForeignKey("blog_post.id"), nullable=False)
    post = relationship("BlogPostModel", back_populates="contents")

    featured_image_id = Column(Integer, ForeignKey("attachment.id"))
    featured_image = relationship("AttachmentModel", foreign_keys=[featured_image_id])

    seo_metadata_title = Column(
        String(255),
        nullable=True,
    )  # SEO title - defaults to associated content title
    seo_metadata_description = Column(
        Text,
        nullable=True,
    )  # SEO description - meta description for search results
    seo_metadata_featured_image_id = Column(
        Integer,
        ForeignKey("attachment.id"),
        nullable=True,
    )  # Featured image for social sharing and search results
    seo_metadata_featured_image = relationship(
        "AttachmentModel", foreign_keys=[seo_metadata_featured_image_id]
    )
    seo_metadata_allow_indexing = Column(
        Boolean,
        default=True,
        nullable=True,
    )  # Allow search engine indexing

    # Custom code field
    custom_code = Column(Text, nullable=True)  # Language-specific custom code

    # Per-language publish state. Each content row has its own live flag so
    # languages can be published/unpublished independently. The parent
    # blog_post.published flag is derived from this (any True -> parent True).
    published = Column(Boolean, default=False, nullable=False)
    last_modified_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    updated_by = relationship("UserModel", foreign_keys=[updated_by_id])

    # Draft fields — autosave writes here; publish copies draft_* -> live fields.
    has_draft = Column(Boolean, default=False, nullable=False)
    draft_title = Column(String, nullable=True)
    draft_subtitle = Column(Text, nullable=True)
    draft_content = Column(Text, nullable=True)
    draft_reading_length = Column(String, nullable=True)
    draft_featured_image_id = Column(
        Integer, ForeignKey("attachment.id"), nullable=True
    )
    draft_featured_image = relationship(
        "AttachmentModel", foreign_keys=[draft_featured_image_id]
    )
    draft_seo_metadata_title = Column(String(255), nullable=True)
    draft_seo_metadata_description = Column(Text, nullable=True)
    draft_seo_metadata_featured_image_id = Column(
        Integer, ForeignKey("attachment.id"), nullable=True
    )
    draft_seo_metadata_featured_image = relationship(
        "AttachmentModel", foreign_keys=[draft_seo_metadata_featured_image_id]
    )
    draft_seo_metadata_allow_indexing = Column(Boolean, nullable=True)
    draft_custom_code = Column(Text, nullable=True)
    draft_last_modified_at = Column(DateTime, nullable=True)
    draft_updated_by_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    draft_updated_by = relationship("UserModel", foreign_keys=[draft_updated_by_id])

    search_vector = Column(TSVector)

    revisions = relationship(
        "BlogPostContentRevisionModel",
        back_populates="blog_post_content",
        cascade="all, delete-orphan",
        order_by="BlogPostContentRevisionModel.created_at.desc()",
    )

    __table_args__ = (
        Index(
            "idx_blog_post_content_search_vector",
            "search_vector",
            postgresql_using="gin",
        ),
    )

    @staticmethod
    def _update_search_vector(db: Session, record):
        """Populate the tsvector column from title + plain-text content."""
        from deepsel.apps.cms.utils.search import strip_html_tags

        body = strip_html_tags(record.content)
        db.execute(
            sa_text(
                "UPDATE blog_post_content SET search_vector = "
                "setweight(to_tsvector('simple', coalesce(:title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(:body, '')), 'B') "
                "WHERE id = :id"
            ),
            {"title": record.title or "", "body": body, "id": record.id},
        )

    @classmethod
    def create(cls, db: Session, user, values: dict, *args, **kwargs):
        res = super().create(db, user, values, *args, **kwargs)
        cls._update_search_vector(db, res)
        return res

    def update(
        self,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ):
        values["last_modified_at"] = datetime.now(timezone.utc)
        values["updated_by_id"] = user.id if user else None

        res = super().update(db, user, values, commit, *args, **kwargs)
        self._update_search_vector(db, res)
        return res
