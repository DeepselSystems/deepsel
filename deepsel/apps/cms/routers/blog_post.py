from typing import Any, Optional
from fastapi import Body, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..utils.get_blog_list import BlogListResponse, get_blog_list
from ..utils.get_blog_post import BlogPostResponse, get_blog_post
from ..utils.translate_blog_content import translate_blog_content
from ..utils.blog_post_slug import (
    generate_slug_from_blog_title,
    check_blog_post_slug_with_conflict,
)
from deepsel.utils.models_pool import models_pool
from deepsel.utils.crud_router import CRUDRouter
from ..schemas.blog_post import (
    BlogPostCreate,
    BlogPostRead,
    BlogPostSearch,
    BlogPostUpdate,
)
from deepsel.deps import get_db
from deepsel.auth.get_current_user import get_current_user, get_current_user_optional
import logging

logger = logging.getLogger(__name__)

table_name = "blog_post"

router = CRUDRouter(
    read_schema=BlogPostRead,
    search_schema=BlogPostSearch,
    create_schema=BlogPostCreate,
    update_schema=BlogPostUpdate,
    table_name=table_name,
)


class TranslationRequest(BaseModel):
    content: dict[str, Any]
    sourceLocale: str
    targetLocale: str


class _GenerateSlugRequest(BaseModel):
    title: str
    max_length: Optional[int] = 50
    blog_post_id: Optional[int] = None


class _GenerateSlugResponse(BaseModel):
    title: str
    slug: str
    blog_post_id: Optional[int] = None


class _ValidateSlugRequest(BaseModel):
    blog_post_id: Optional[int] = None
    slug: str


class _ConflictingBlogPost(BaseModel):
    id: int
    slug: str


class _ValidateSlugResponse(BaseModel):
    is_valid: bool
    slug: str
    blog_post_id: Optional[int] = None
    conflicting_blog_post: Optional[_ConflictingBlogPost] = None
    suggested_slug: Optional[str] = None


# generate-slug/validate-slug intentionally skip a per-call
# _check_has_permission — they require auth (get_current_user) and are
# always org-scoped (organization_id below), and every caller of these
# admin-UI-only endpoints already holds blog_post permissions to reach the
# create/edit screen that calls them. Accepted risk, not an oversight.
@router.post("/generate-slug", response_model=_GenerateSlugResponse)
def generate_slug(
    request: _GenerateSlugRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
) -> _GenerateSlugResponse:
    """
    Generate a unique slug from a title (blog slugs are shared across all
    languages of a post — unlike Page's per-locale slug, this checks against
    the blog_post table directly). Guaranteed unique within the org.
    """
    org_id = getattr(user, "current_organization_id", None)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )
    generated_slug = generate_slug_from_blog_title(
        db=db,
        title=request.title,
        max_length=request.max_length,
        current_blog_post_id=request.blog_post_id,
        organization_id=org_id,
    )
    return _GenerateSlugResponse(
        title=request.title,
        slug=generated_slug,
        blog_post_id=request.blog_post_id,
    )


@router.post("/validate-slug", response_model=_ValidateSlugResponse)
def validate_slug(
    request: _ValidateSlugRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
) -> _ValidateSlugResponse:
    """Validate if a slug is available for use (not already taken by another blog_post)."""
    org_id = getattr(user, "current_organization_id", None)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )
    is_valid, conflicting = check_blog_post_slug_with_conflict(
        db=db,
        slug=request.slug,
        current_blog_post_id=request.blog_post_id,
        organization_id=org_id,
    )

    response_data = {
        "is_valid": is_valid,
        "slug": request.slug,
        "blog_post_id": request.blog_post_id,
        "conflicting_blog_post": None,
        "suggested_slug": None,
    }

    if not is_valid and conflicting:
        response_data["conflicting_blog_post"] = _ConflictingBlogPost(
            id=conflicting.id,
            slug=conflicting.slug,
        )
        response_data["suggested_slug"] = generate_slug_from_blog_title(
            db=db,
            title=request.slug.lstrip("/"),
            current_blog_post_id=request.blog_post_id,
            organization_id=org_id,
        )

    return _ValidateSlugResponse(**response_data)


@router.post("/translate")
async def translate_content(
    request: TranslationRequest = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Translate blog post content from source locale to target locale"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    org_id = getattr(user, "current_organization_id", None)
    if org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )
    OrganizationModel = models_pool["organization"]
    org_settings = db.query(OrganizationModel).get(org_id)

    return await translate_blog_content(
        content=request.content,
        source_locale=request.sourceLocale,
        target_locale=request.targetLocale,
        org_settings=org_settings,
    )


# /blog_post/list/lang
@router.get("/list/{lang}", response_model=BlogListResponse)
def get_website_blog_list(
    request: Request,
    lang: str,
    page: int = 1,
    page_size: Optional[int] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    return get_blog_list(
        request=request,
        target_lang=lang,
        db=db,
        current_user=user,
        page=page,
        page_size=page_size,
    )


# /blog_post/single/lang/slug
@router.get("/single/{lang}/{slug}", response_model=BlogPostResponse)
def get_website_blog_post(
    request: Request,
    lang: str,
    slug: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    logger.info(f"Get website blog post: {lang}/{slug}")
    return get_blog_post(
        request=request,
        target_lang=lang,
        post_slug=slug,
        db=db,
        current_user=user,
    )
