import logging

from sqlalchemy import Column, Integer, Boolean, Text

from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from deepsel.orm import (
    PAGINATION,
    SearchQuery,
    OrderByCriteria,
    SearchCriteria,
    ActivityMixin,
)
from deepsel.utils.models_pool import models_pool
from sqlalchemy.orm import relationship, Session
from fastapi import HTTPException, status
from typing import Optional

logger = logging.getLogger(__name__)


class PageModel(Base, ActivityMixin, BaseModel):
    __tablename__ = "page"
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

    is_homepage = Column(Boolean, default=False)

    # Require login to view page content
    require_login = Column(Boolean, default=False)

    # Custom code field for all languages
    page_custom_code = Column(Text, nullable=True)

    contents = relationship(
        "PageContentModel",
        back_populates="page",
        cascade="all, delete-orphan",
    )

    @classmethod
    def get_one(cls, db: Session, user, item_id: int, *args, **kwargs):
        if user is None or not user.signed_up:
            res = db.query(cls).get(item_id)
            if res is None or not res.published:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Item not found",
                )
            return res
        return super().get_one(db, user, item_id, *args, **kwargs)

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

    @classmethod
    def create(cls, db: Session, user, values: dict, *args, **kwargs):
        contents = values.get("contents", [])
        cls._normalize_contents(contents)
        if values.get("is_homepage"):
            cls._resolve_homepage_switch(db, current_page_id=None)
        cls._validate_contents(db=db, contents=contents)
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
        contents = values.get("contents", [])
        self._normalize_contents(contents)
        if values.get("is_homepage"):
            self._resolve_homepage_switch(db, current_page_id=self.id)
        self._validate_contents(db=db, contents=contents)
        return super().update(db, user, values, commit, *args, **kwargs)

    @classmethod
    def _resolve_homepage_switch(cls, db: Session, current_page_id: int = None):
        """
        When a page is being set as the new homepage, resolve conflicts with
        the old homepage by unsetting its is_homepage flag and generating
        new slugs for its contents.
        """
        from deepsel.apps.cms.utils.page_content import generate_slug_from_title

        query = db.query(cls).filter(cls.is_homepage == True)  # noqa: E712
        if current_page_id is not None:
            query = query.filter(cls.id != current_page_id)

        old_homepages = query.all()
        for old_homepage in old_homepages:
            old_homepage.is_homepage = False
            for content in old_homepage.contents:
                if content.slug == "/":
                    content.slug = generate_slug_from_title(
                        db=db,
                        title=content.title,
                        locale_id=content.locale_id,
                        current_page_content_id=content.id,
                    )
        db.flush()

    @classmethod
    def _normalize_slug(cls, slug: str) -> str:
        """
        Normalize slug by ensuring it starts with a forward slash.
        """
        if not slug.startswith("/"):
            return f"/{slug}"
        return slug

    @classmethod
    def _normalize_contents(cls, contents: list[dict]):
        """
        Normalize all slugs in contents by ensuring they start with a forward slash.
        """
        for content in contents:
            content["slug"] = cls._normalize_slug(content["slug"])

    @classmethod
    def _validate_contents(cls, db: Session, contents: list[dict]):
        """
        Validate page contents for slug conflicts.

        This function performs two types of validation:
        1. Internal validation: Check for duplicate slugs within the same locale_id among the contents being validated
        2. External validation: Check for slug conflicts with existing content in the database
        """
        from deepsel.apps.cms.utils.page_content import (
            check_page_content_slug_with_conflict,
        )

        # Internal validation: Check for duplicate slugs within the same locale_id
        slug_locale_combinations = {}
        for i, content in enumerate(contents):
            slug = content["slug"]
            locale_id = content["locale_id"]
            combination_key = (slug, locale_id)

            if combination_key in slug_locale_combinations:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate slug '{slug}' found for locale_id '{locale_id}' within the same page contents",
                )
            slug_locale_combinations[combination_key] = i

        # External validation: Check for conflicts with existing content in database
        for content in contents:
            is_valid, existing_content = check_page_content_slug_with_conflict(
                db=db,
                slug=content["slug"],
                locale_id=content["locale_id"],
                current_page_content_id=content.get("id", None),
            )
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slug '{content['slug']}' is not valid, it is already used on '{existing_content.title} (Language: {existing_content.locale.name})'",
                )
