from typing import Optional, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..types.seo import SEOMetadata
from ..types.blog import AuthorData, LanguageAlternative
from ..types.public_settings import PublicSettings
from deepsel.types.locale import LocaleData
from deepsel.utils.models_pool import models_pool
from .attachment_utils import resolve_attachment_locale_version
from .domain_detection import detect_domain_from_request
from .render_wysiwyg_content import render_wysiwyg_content
from fastapi import Request
import logging

logger = logging.getLogger(__name__)


class BlogPostResponse(BaseModel):
    """Response model for single blog post"""

    id: int
    title: str
    content: str
    lang: str
    public_settings: PublicSettings
    seo_metadata: SEOMetadata
    custom_code: Optional[str] = None
    blog_post_custom_code: Optional[str] = None
    require_login: Optional[bool] = None
    featured_image_id: Optional[int] = None
    featured_image_name: Optional[str] = None
    featured_image_version_name: Optional[str] = None
    publish_date: Optional[str] = None
    author: Optional[AuthorData] = None
    language_alternatives: list[LanguageAlternative]


def get_blog_post(
    request: Request,
    target_lang: str,
    post_slug: str,
    db: Session,
    current_user: Optional[Any] = None,
) -> BlogPostResponse:
    """
    Get blog post content by language and slug.

    Args:
        request: FastAPI request object for domain detection
        target_lang: Resolved language ISO code (already determined by parent)
        post_slug: Blog post slug (without /blog prefix); accepts with or without leading "/"
        db: Database session
        current_user: Optional authenticated user

    Returns:
        BlogPostResponse: Blog post data including content, metadata, and settings
    """
    BlogPostModel = models_pool["blog_post"]
    OrganizationModel = models_pool["organization"]

    # Detect organization by domain
    domain = detect_domain_from_request(request)
    org_settings = OrganizationModel.find_organization_by_domain(domain, db)

    if target_lang == "default":
        target_lang = org_settings.default_language.iso_code

    # DB stores slugs with a leading "/" (matches page pattern). Public URLs like
    # /blog/my-post strip "/blog/" upstream, so we normalize the incoming slug to
    # always start with "/" before querying. This keeps legacy bookmarked URLs
    # working after the slug-storage migration.
    if post_slug and not post_slug.startswith("/"):
        post_slug = f"/{post_slug}"

    # Find the blog post with matching slug and organization. Publish state is
    # per-language now, so we filter on content.published when picking the
    # specific language row below.
    blog_post = (
        db.query(BlogPostModel)
        .filter(
            BlogPostModel.slug == post_slug,
            BlogPostModel.organization_id == org_settings.id,
        )
        .first()
    )

    if not blog_post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Blog post not found"
        )

    # Check if login is required for this blog post
    if blog_post.require_login:
        # If login is required, check authentication
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
            )

    if not blog_post.contents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Blog post not found"
        )

    # Find matching content for the requested language (only published ones are
    # publicly visible).
    matching_content = next(
        (
            c
            for c in blog_post.contents
            if c.locale.iso_code == target_lang and c.published
        ),
        None,
    )

    if not matching_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content not available in this language",
        )

    # Get public settings
    settings = org_settings.get_public_settings(
        org_settings.id,
        db,
        lang=target_lang,
    )

    # Prepare SEO metadata
    seo_metadata = SEOMetadata(
        title=matching_content.seo_metadata_title or matching_content.title,
        description=matching_content.seo_metadata_description,
        featured_image_id=matching_content.seo_metadata_featured_image_id,
        featured_image_name=(
            matching_content.seo_metadata_featured_image.name
            if matching_content.seo_metadata_featured_image
            else None
        ),
        featured_image_version_name=getattr(
            resolve_attachment_locale_version(
                matching_content.seo_metadata_featured_image, target_lang
            ),
            "name",
            None,
        ),
        allow_indexing=matching_content.seo_metadata_allow_indexing,
    )
    # Convert author to AuthorData if it exists
    author_data = None
    if blog_post.author:
        author_data = AuthorData(
            id=blog_post.author.id,
            display_name=blog_post.author.name,
            username=blog_post.author.username,
            image=blog_post.author.image.name if blog_post.author.image else None,
        )

    # Build language alternatives
    language_alternatives = [
        LanguageAlternative(
            slug=f"/blog{blog_post.slug}",
            locale=LocaleData(
                id=content.locale.id,
                name=content.locale.name,
                iso_code=content.locale.iso_code,
            ),
        )
        for content in blog_post.contents
        if content.published
        and content.locale.iso_code != matching_content.locale.iso_code
    ]

    # Render Jinja2 syntax in content (e.g. {{ attachment(...) }}, {{ gallery(...) }})
    rendered_content = render_wysiwyg_content(
        matching_content,
        org_settings.id,
        db,
        default_lang_id=org_settings.default_language_id,
    )

    # Return blog post data
    return BlogPostResponse(
        id=blog_post.id,
        title=matching_content.title,
        content=rendered_content or matching_content.content,
        lang=target_lang,
        public_settings=settings,
        seo_metadata=seo_metadata,
        custom_code=matching_content.custom_code,
        blog_post_custom_code=blog_post.blog_post_custom_code,
        require_login=blog_post.require_login,
        featured_image_id=matching_content.featured_image_id,
        featured_image_name=(
            matching_content.featured_image.name
            if matching_content.featured_image
            else None
        ),
        featured_image_version_name=getattr(
            resolve_attachment_locale_version(
                matching_content.featured_image, target_lang
            ),
            "name",
            None,
        ),
        publish_date=(
            blog_post.publish_date.isoformat() if blog_post.publish_date else None
        ),
        author=author_data,
        language_alternatives=language_alternatives,
    )
