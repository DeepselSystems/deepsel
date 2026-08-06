import logging
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Text
from datetime import datetime

from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import (
    ActivityMixin,
    PAGINATION,
    SearchQuery,
    OrderByCriteria,
    SearchCriteria,
)
from deepsel.utils.models_pool import models_pool
from sqlalchemy.orm import relationship, Session
from fastapi import HTTPException, status
from typing import Optional

logger = logging.getLogger(__name__)


class BlogPostModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "blog_post"
    __tracked_fields__ = ["published"]

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
    published = Column(Boolean, default=False)
    slug = Column(String(255), nullable=True, index=True)
    publish_date = Column(DateTime, default=datetime.utcnow)

    # Author reference
    author_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    author = relationship("UserModel", foreign_keys=[author_id])

    # Require login to view blog post content
    require_login = Column(Boolean, default=False)

    # Custom code field for all languages
    blog_post_custom_code = Column(Text, nullable=True)

    contents = relationship(
        "BlogPostContentModel",
        back_populates="post",
        cascade="all, delete-orphan",
    )

    @staticmethod
    def _validate_slug(
        db: Session,
        slug: str,
        organization_id: Optional[int],
        current_blog_post_id: Optional[int] = None,
    ):
        """
        Reject a slug that is already used by another blog_post row in the same
        tenant. This is the source of truth for slug uniqueness — the admin
        UI's /validate-slug check is display-only and must not be relied on to
        block a save.
        """
        from deepsel.apps.cms.utils.blog_post_slug import (
            check_blog_post_slug_with_conflict,
        )
        from deepsel.apps.cms.utils.slug_lock import acquire_slug_lock

        # Serialize concurrent requests for this slug so the check below and
        # the eventual insert/update can't race (see acquire_slug_lock).
        acquire_slug_lock(db, "blog_post", organization_id, slug)

        is_valid, existing_post = check_blog_post_slug_with_conflict(
            db=db,
            slug=slug,
            current_blog_post_id=current_blog_post_id,
            organization_id=organization_id,
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{slug}' is already used by another blog post "
                f"(ID: {existing_post.id}).",
            )

    @classmethod
    def create(cls, db: Session, user, values: dict, *args, **kwargs):
        if values.get("slug"):
            values["slug"] = cls._normalize_slug(values["slug"])
            organization_id = values.get("organization_id") or getattr(
                user, "current_organization_id", None
            )
            cls._validate_slug(db, values["slug"], organization_id)
        return super().create(db, user, values, *args, **kwargs)

    def update(
        self,
        db: Session,
        user,
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ):
        if values.get("slug"):
            values["slug"] = self._normalize_slug(values["slug"])
            if values["slug"] != self.slug:
                organization_id = values.get("organization_id") or self.organization_id
                self._validate_slug(
                    db, values["slug"], organization_id, current_blog_post_id=self.id
                )
        return super().update(db, user, values, commit, *args, **kwargs)

    @staticmethod
    def _normalize_slug(slug: str) -> str:
        """Ensure blog post slug is stored with a leading forward slash (matches page pattern)."""
        if not slug:
            return slug
        return slug if slug.startswith("/") else f"/{slug}"

    @classmethod
    def get_one(cls, db: Session, user, item_id: int, *args, **kwargs):
        res = db.query(cls).get(item_id)
        if user is None or not user.signed_up:
            if not res.published:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Item not found",
                )
        return res

    @classmethod
    def search(
        cls,
        db: Session,
        user,
        pagination: PAGINATION,
        search: Optional[SearchQuery] = None,
        order_by: Optional[OrderByCriteria] = None,
        *args,
        **kwargs,
    ):
        if user is None or not user.signed_up:
            search = search or SearchQuery()
            if search.AND is None:
                search.AND = []
            search.AND.append(
                SearchCriteria(field="published", operator="=", value=True)
            )

        return super().search(db, user, pagination, search, order_by, *args, **kwargs)
