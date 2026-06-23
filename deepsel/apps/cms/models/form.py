from deepsel.orm import PAGINATION, SearchQuery, OrderByCriteria, SearchCriteria
from deepsel.orm.activity_mixin import ActivityMixin
from sqlalchemy import Column, Integer, Boolean, Text
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship, Session
from fastapi import HTTPException, status
from typing import Optional
from deepsel.utils.models_pool import models_pool

UserModel = models_pool["user"]


class FormModel(Base, ActivityMixin, BaseModel):
    """
    Main form model that holds form metadata and settings.
    Similar to PageModel, this contains the form-level information
    while FormContentModel contains language-specific content.
    """

    __tablename__ = "form"
    __tracked_fields__ = ["published"]

    @classmethod
    def _get_activity_model(cls):
        from deepsel.apps.cms.models.activity import ActivityModel, ActivityType

        return ActivityModel, ActivityType

    id = Column(Integer, primary_key=True)
    published = Column(Boolean, default=True)  # Default true as per requirement

    # Custom code field for all languages
    form_custom_code = Column(Text, nullable=True)

    # Relationships
    contents = relationship(
        "FormContentModel", back_populates="form", cascade="all, delete-orphan"
    )

    # Relationship with form submissions
    submissions = relationship(
        "FormSubmissionModel",
        back_populates="form",
        cascade="all, delete-orphan",
    )

    @property
    def name(self) -> str:
        """
        Get the form name from the first available form content title.
        Used for display purposes in RecordSelect and other components.
        """
        if self.contents and len(self.contents) > 0:
            # Return the first content's title
            return self.contents[0].title or f"Form #{self.id}"
        return f"Form #{self.id}"

    @classmethod
    def get_one(
        cls, db: Session, user: UserModel, item_id: int, *args, **kwargs
    ) -> "FormModel":
        """
        Get a single form by ID with proper access control.
        Public users can only see published forms.
        """
        if user.is_public_user():
            # Public path: skip role/org checks, enforce published filter directly.
            res = db.query(cls).filter(cls.id == item_id, cls.published == True).first()
            if not res:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Form not found",
                )
            return res

        # Authenticated path: delegate to base so _check_has_permission and
        # org-scope filtering are applied normally.
        return super().get_one(db, user, item_id, *args, **kwargs)

    @classmethod
    def search(
        cls,
        db: Session,
        user: UserModel,
        pagination: PAGINATION,
        search: Optional[SearchQuery] = None,
        order_by: Optional[OrderByCriteria] = None,
        *args,
        **kwargs,
    ):
        """
        Search forms with proper access control.
        Public users can only see published forms.
        """
        # Check if user is public user
        # If yes, filter by published=True
        if user.is_public_user():
            search = search or SearchQuery()
            if search.AND is None:
                search.AND = []
            search.AND.append(
                SearchCriteria(field="published", operator="=", value=True)
            )

        return super().search(db, user, pagination, search, order_by, *args, **kwargs)

    @classmethod
    def create(
        cls, db: Session, user: UserModel, values: dict, *args, **kwargs
    ) -> "FormModel":
        """
        Create a new form with validation for contents.
        """
        contents = values.get("contents", [])
        cls._normalize_contents(contents)
        cls._validate_contents(db=db, contents=contents)
        return super().create(db, user, values, *args, **kwargs)

    def update(
        self,
        db: Session,
        user: "UserModel",
        values: dict,
        commit: Optional[bool] = True,
        *args,
        **kwargs,
    ) -> "FormModel":
        """
        Update form with validation for contents.
        """
        contents = values.get("contents", [])
        self._normalize_contents(contents)
        self._validate_contents(db=db, contents=contents)
        return super().update(db, user, values, commit, *args, **kwargs)

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
            if content.get("slug"):
                content["slug"] = cls._normalize_slug(content["slug"])

    @classmethod
    def _validate_contents(cls, db: Session, contents: list[dict]):
        """
        Validate form contents for slug conflicts.

        This function performs two types of validation:
        1. Internal validation: Check for duplicate slugs within the same locale_id among the contents being validated
        2. External validation: Check for slug conflicts with existing content in the database
        """
        from deepsel.apps.cms.utils.form_content import (
            check_form_content_slug_with_conflict,
        )

        # Internal validation: Check for duplicate slugs within the same locale_id
        slug_locale_combinations = {}
        for i, content in enumerate(contents):
            slug = content.get("slug")
            locale_id = content.get("locale_id")

            if not slug or not locale_id:
                continue

            combination_key = (slug, locale_id)

            if combination_key in slug_locale_combinations:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate slug '{slug}' found for locale_id '{locale_id}' within the same form contents",
                )
            slug_locale_combinations[combination_key] = i

        # External validation: Check for conflicts with existing content in database
        for content in contents:
            slug = content.get("slug")
            locale_id = content.get("locale_id")

            if not slug or not locale_id:
                continue

            is_valid, existing_content = check_form_content_slug_with_conflict(
                db=db,
                slug=slug,
                locale_id=locale_id,
                current_form_content_id=content.get("id", None),
            )
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slug '{slug}' is not valid, it is already used on '{existing_content.title} (Language: {existing_content.locale.name})'",
                )
