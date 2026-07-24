from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Index,
    Boolean,
    Text,
    DateTime,
    text as sa_text,
)
from deepsel.apps.cms.utils.tsvector import TSVector
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship, Session
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, status


class PageContentModel(Base, BaseModel):
    __tablename__ = "page_content"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    content = Column(Text)
    slug = Column(String(255), nullable=True)

    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=False)
    locale = relationship("LocaleModel")

    page_id = Column(Integer, ForeignKey("page.id"), nullable=False)
    page = relationship("PageModel", back_populates="contents")

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
    # page.published flag is derived from this (any True -> parent True).
    published = Column(Boolean, default=False, nullable=False)
    last_modified_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    updated_by = relationship("UserModel", foreign_keys=[updated_by_id])

    # Draft fields — autosave writes here; publish copies draft_* -> live fields.
    has_draft = Column(Boolean, default=False, nullable=False)
    draft_title = Column(String, nullable=True)
    draft_content = Column(Text, nullable=True)
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
        "PageContentRevisionModel",
        back_populates="page_content",
        cascade="all, delete-orphan",
        order_by="PageContentRevisionModel.created_at.desc()",
    )

    __table_args__ = (
        Index("idx_page_content_page_id_slug", "page_id", "slug"),
        Index(
            "idx_page_content_search_vector",
            "search_vector",
            postgresql_using="gin",
        ),
    )

    @staticmethod
    def _update_search_vector(db: Session, record):
        """Populate the tsvector column from title + plain-text content."""
        from deepsel.apps.cms.utils.search import extract_page_plain_text

        body = extract_page_plain_text(record.content)
        db.execute(
            sa_text(
                "UPDATE page_content SET search_vector = "
                "setweight(to_tsvector('simple', coalesce(:title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(:body, '')), 'B') "
                "WHERE id = :id"
            ),
            {"title": record.title or "", "body": body, "id": record.id},
        )

    @staticmethod
    def _validate_slug(
        db: Session,
        slug: str,
        locale_id: int,
        organization_id: Optional[int],
        current_page_content_id: Optional[int] = None,
    ):
        """
        Reject a slug that is already used by another page_content row in the
        same tenant + locale. This is the source of truth for slug uniqueness —
        the admin UI's /validate-slug check is display-only and must not be
        relied on to block a save.
        """
        from deepsel.apps.cms.utils.page_content import (
            check_page_content_slug_with_conflict,
        )

        is_valid, existing_content = check_page_content_slug_with_conflict(
            db=db,
            slug=slug,
            locale_id=locale_id,
            current_page_content_id=current_page_content_id,
            organization_id=organization_id,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{slug}' is already used on '{existing_content.title} "
                f"(Language: {existing_content.locale.name})'",
            )

    @classmethod
    def create(cls, db: Session, user, values: dict, *args, **kwargs):
        slug = values.get("slug")
        if slug:
            organization_id = values.get("organization_id") or getattr(
                user, "current_organization_id", None
            )
            cls._validate_slug(db, slug, values.get("locale_id"), organization_id)

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
        slug = values.get("slug")
        if slug and slug != self.slug:
            organization_id = values.get("organization_id") or self.organization_id
            locale_id = values.get("locale_id", self.locale_id)
            self._validate_slug(
                db, slug, locale_id, organization_id, current_page_content_id=self.id
            )

        values["last_modified_at"] = datetime.now(timezone.utc)
        values["updated_by_id"] = user.id if user else None

        res = super().update(db, user, values, commit, *args, **kwargs)
        self._update_search_vector(db, res)
        return res
