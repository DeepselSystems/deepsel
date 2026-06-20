from typing import Any, Optional
from fastapi import Body, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..utils.get_blog_list import BlogListResponse, get_blog_list
from ..utils.get_blog_post import BlogPostResponse, get_blog_post
from ..utils.translate_blog_content import translate_blog_content
from deepsel.utils.models_pool import models_pool
from deepsel.utils.crud_router import CRUDRouter
from ..schemas.blog_post import (
    BlogPostCreate,
    BlogPostRead,
    BlogPostSearch,
    BlogPostUpdate,
)
from deepsel.deps import get_current_user, get_db
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
):
    return get_blog_list(
        request=request,
        target_lang=lang,
        db=db,
        current_user=None,
        page=page,
        page_size=page_size,
    )


# /blog_post/single/lang/slug
@router.get("/single/{lang}/{slug}", response_model=BlogPostResponse)
def get_website_blog_post(
    request: Request, lang: str, slug: str, db: Session = Depends(get_db)
):
    logger.info(f"Get website blog post: {lang}/{slug}")
    return get_blog_post(
        request=request,
        target_lang=lang,
        post_slug=slug,
        db=db,
        current_user=None,
    )
