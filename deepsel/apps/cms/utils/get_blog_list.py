from typing import Optional, Any
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from ..types.public_settings import PublicSettings
from ..types.blog import BlogPostListItem
from deepsel.utils.models_pool import models_pool
from .domain_detection import detect_domain_from_request
from deepsel.apps.cms.utils.attachment_utils import resolve_attachment_locale_version
from fastapi import Request
from traceback import print_exc
import logging

logger = logging.getLogger(__name__)


class BlogListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lang: str = None
    public_settings: PublicSettings
    blog_posts: Optional[list[BlogPostListItem]] = None
    page: int = 1
    page_size: int = 6
    total_count: int = 0
    total_pages: int = 0


def get_blog_list(
    request: Request,
    target_lang: str,
    db: Session,
    current_user: Optional[Any] = None,
    page: int = 1,
    page_size: Optional[int | None] = None,
) -> BlogListResponse:
    """
    Get published blog posts by language for website display.

    Args:
        target_lang: Resolved language ISO code (already determined by parent)
        db: Database session
        current_user: Optional authenticated user

    Returns:
        BlogListResponse: The blog list response object
    """
    try:
        BlogPostModel = models_pool["blog_post"]
        BlogPostContentModel = models_pool["blog_post_content"]
        LocaleModel = models_pool["locale"]
        OrganizationModel = models_pool["organization"]

        # Detect organization by domain
        domain: str = detect_domain_from_request(request)
        org_settings = OrganizationModel.find_organization_by_domain(domain, db)
        target_lang_iso_code = (
            org_settings.default_language.iso_code
            if target_lang == "default"
            else target_lang
        )
        page_size = org_settings.blog_posts_per_page if page_size is None else page_size

        # Build base query with filters
        base_query = (
            db.query(BlogPostModel)
            .join(
                BlogPostContentModel, BlogPostModel.id == BlogPostContentModel.post_id
            )
            .join(LocaleModel, BlogPostContentModel.locale_id == LocaleModel.id)
            .filter(
                BlogPostContentModel.published == True,
                LocaleModel.iso_code == target_lang_iso_code,
                BlogPostModel.organization_id == org_settings.id,
            )
        )

        # Get total count efficiently
        total_count = base_query.count()
        total_pages = (
            (total_count + page_size - 1) // page_size if total_count > 0 else 0
        )

        # Query published blog posts with content in the specified language
        query = (
            db.query(BlogPostModel, BlogPostContentModel)
            .join(
                BlogPostContentModel, BlogPostModel.id == BlogPostContentModel.post_id
            )
            .join(LocaleModel, BlogPostContentModel.locale_id == LocaleModel.id)
            .filter(
                BlogPostContentModel.published == True,
                LocaleModel.iso_code == target_lang_iso_code,
                BlogPostModel.organization_id == org_settings.id,
            )
            .order_by(BlogPostModel.publish_date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        results = query.all()

        blog_posts = []
        for blog_post, content in results:
            # Skip blog posts that require login if user is not authenticated
            if blog_post.require_login and not current_user:
                continue

            # Convert author to dict if it exists
            author_data = None
            if blog_post.author:
                author_data = {
                    "id": blog_post.author.id,
                    "display_name": blog_post.author.name,
                    "username": blog_post.author.username,
                    "image": (
                        blog_post.author.image.name if blog_post.author.image else None
                    ),
                }

            blog_posts.append(
                {
                    "id": blog_post.id,
                    "title": content.title,
                    "slug": blog_post.slug,
                    "excerpt": content.subtitle,  # Use subtitle as excerpt
                    "featured_image_id": content.featured_image_id,
                    "featured_image_name": (
                        content.featured_image.name if content.featured_image else None
                    ),
                    "featured_image_version_name": getattr(
                        resolve_attachment_locale_version(
                            content.featured_image, target_lang_iso_code
                        ),
                        "name",
                        None,
                    ),
                    "publish_date": (
                        blog_post.publish_date.isoformat()
                        if blog_post.publish_date
                        else None
                    ),
                    "author": author_data,
                    "lang": target_lang,
                }
            )

        # Get public settings
        settings = org_settings.get_public_settings(
            org_settings.id,
            db,
            lang=target_lang_iso_code,
        )

        return BlogListResponse(
            blog_posts=blog_posts,
            public_settings=settings,
            lang=target_lang_iso_code,
            page=page,
            page_size=page_size,
            total_count=total_count,
            total_pages=total_pages,
        )

    except Exception:
        # Return empty list instead of error to avoid breaking the website
        print_exc()
        settings = org_settings.get_public_settings(
            org_settings.id,
            db,
            lang=target_lang_iso_code,
        )
        return BlogListResponse(
            blog_posts=[],
            public_settings=settings,
            lang=target_lang_iso_code,
            page=page,
            page_size=page_size,
            total_count=0,
            total_pages=0,
        )
