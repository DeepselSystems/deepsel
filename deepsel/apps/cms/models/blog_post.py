from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, Text
from datetime import datetime

from deepsel.apps.cms.types.activity import ActivityType
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


class BlogPostModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "blog_post"
    __tracked_fields__ = ["published"]

    @classmethod
    def _get_activity_model(cls):
        ActivityModel = models_pool["activity"]

        return ActivityModel, ActivityType

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

    @classmethod
    def create(cls, db: Session, user, values: dict, *args, **kwargs):
        if values.get("slug"):
            values["slug"] = cls._normalize_slug(values["slug"])
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
