from typing import Optional, Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from deepsel.deps import get_db
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.crud_router import CRUDRouter
from ..schemas.page_content import (
    PageContentCreate,
    PageContentRead,
    PageContentSearch,
    PageContentUpdate,
)
from fastapi import Depends
from ..utils.page_content import (
    generate_slug_from_title,
    check_page_content_slug_with_conflict,
)

table_name = "page_content"

router = CRUDRouter(
    read_schema=PageContentRead,
    search_schema=PageContentSearch,
    create_schema=PageContentCreate,
    update_schema=PageContentUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)


class _GenerateSlugRequest(BaseModel):
    title: str
    locale_id: int
    max_length: Optional[int] = 50
    page_content_id: Optional[int] = None


class _GenerateSlugResponse(BaseModel):
    title: str
    slug: str
    locale_id: int
    page_content_id: Optional[int] = None


class _ValidateSlugRequest(BaseModel):
    page_content_id: Optional[int] = None
    locale_id: int
    slug: str
    theme_name: Optional[str] = None


class _ConflictingPageContent(BaseModel):
    id: int
    title: str
    slug: str
    locale_id: int
    content: Optional[Any] = None


class _ValidateSlugResponse(BaseModel):
    is_valid: bool
    slug: str
    locale_id: int
    page_content_id: Optional[int] = None
    conflicting_page_content: Optional[_ConflictingPageContent] = None
    suggested_slug: Optional[str] = None
    theme_conflict: Optional[str] = None


@router.post("/generate-slug", response_model=_GenerateSlugResponse)
def generate_slug(
    request: _GenerateSlugRequest,
    db: Session = Depends(get_db),
) -> _GenerateSlugResponse:
    """
    Generate a unique slug from a title.

    This endpoint takes a title and generates a URL-friendly slug that is guaranteed
    to be unique within the specified locale. The slug will always start with '/'.
    """
    generated_slug = generate_slug_from_title(
        db=db,
        title=request.title,
        locale_id=request.locale_id,
        max_length=request.max_length,
        current_page_content_id=request.page_content_id,
    )

    return _GenerateSlugResponse(
        title=request.title,
        slug=generated_slug,
        locale_id=request.locale_id,
        page_content_id=request.page_content_id,
    )


@router.post("/validate-slug", response_model=_ValidateSlugResponse)
def validate_slug(
    request: _ValidateSlugRequest,
    db: Session = Depends(get_db),
) -> _ValidateSlugResponse:
    """
    Validate if a slug is available for use within a specific locale.

    This endpoint checks if the provided slug is valid (not already taken) within
    the specified locale. If the slug is already taken, it returns the conflicting
    page content and provides a suggested alternative slug.
    """
    # Check slug validity and get conflicting page content if any
    is_valid, conflicting_page_content = check_page_content_slug_with_conflict(
        db=db,
        slug=request.slug,
        locale_id=request.locale_id,
        current_page_content_id=request.page_content_id,
    )

    # Check theme slug conflict
    theme_conflict = None
    if is_valid and request.theme_name:
        from ..utils.theme_pages import (
            get_theme_page_slugs,
            slug_to_theme_filename,
        )

        theme_slugs = get_theme_page_slugs(request.theme_name)
        if request.slug in theme_slugs:
            is_valid = False
            theme_conflict = slug_to_theme_filename(request.slug)

    # Initialize response data
    response_data = {
        "is_valid": is_valid,
        "slug": request.slug,
        "locale_id": request.locale_id,
        "page_content_id": request.page_content_id,
        "conflicting_page_content": None,
        "suggested_slug": None,
        "theme_conflict": theme_conflict,
    }

    # If slug is not valid (conflict exists), provide conflicting content and suggestion
    if not is_valid and conflicting_page_content:
        # Map conflicting page content to response model
        response_data["conflicting_page_content"] = _ConflictingPageContent(
            id=conflicting_page_content.id,
            title=conflicting_page_content.title,
            slug=conflicting_page_content.slug,
            locale_id=conflicting_page_content.locale_id,
            content=conflicting_page_content.content,
        )

        # Generate suggested slug based on the conflicting page content's title
        # This ensures we provide a meaningful alternative
        if conflicting_page_content.title:
            suggested_slug = generate_slug_from_title(
                db=db,
                title=conflicting_page_content.title,
                locale_id=request.locale_id,
                current_page_content_id=request.page_content_id,
            )
            response_data["suggested_slug"] = suggested_slug

    return _ValidateSlugResponse(**response_data)
