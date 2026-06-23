import logging
from typing import Optional
from fastapi import Depends, Request, APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings
from deepsel.utils.models_pool import models_pool
from ..utils.domain_detection import detect_domain_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.API_PREFIX}/sitemap", tags=["Sitemap"])


class SitemapUrlItem(BaseModel):
    """Single sitemap URL item"""

    url: str
    lastmod: Optional[str] = None
    changefreq: Optional[str] = "monthly"
    priority: Optional[str] = "0.8"


class SitemapResponse(BaseModel):
    """Sitemap response containing all indexable URLs"""

    urls: list[SitemapUrlItem]
    total: int


@router.get("/", response_model=SitemapResponse)
async def get_sitemap_data(
    request: Request,
    db: Session = Depends(get_db),
) -> SitemapResponse:
    """Get all published and indexable pages and blog posts for sitemap generation"""

    try:
        sitemap_urls = []

        # Detect organization by domain
        domain = detect_domain_from_request(request)
        logger.info(f"Sitemap generation requested for domain: {domain}")
        OrganizationModel = models_pool["organization"]
        org_settings = OrganizationModel.find_organization_by_domain(domain, db)

        if not org_settings:
            # Return empty sitemap if no organization is found
            logger.warning(f"No organization found for domain: {domain}")
            return SitemapResponse(urls=[], total=0)
        logger.info(f"Generating sitemap for organization: {org_settings.name}")

        # Get default language for URL construction
        default_lang = (
            org_settings.default_language.iso_code
            if org_settings.default_language
            else "en"
        )

        LocaleModel = models_pool["locale"]
        PageModel = models_pool["page"]
        PageContentModel = models_pool["page_content"]
        BlogPostModel = models_pool["blog_post"]
        BlogPostContentModel = models_pool["blog_post_content"]

        # Get all published and indexable pages
        try:
            page_results = (
                db.query(PageModel, PageContentModel, LocaleModel)
                .join(PageContentModel, PageModel.id == PageContentModel.page_id)
                .join(LocaleModel, PageContentModel.locale_id == LocaleModel.id)
                .filter(
                    PageModel.organization_id == org_settings.id,
                    PageContentModel.published == True,
                    PageContentModel.seo_metadata_allow_indexing == True,
                )
                .all()
            )

            for page, content, locale in page_results:
                # Construct URL based on language
                url = content.slug
                if locale.iso_code != default_lang:
                    url = f"/{locale.iso_code}{content.slug}"

                # Determine priority based on page type
                priority = "1.0" if page.is_homepage else "0.8"

                # Use page updated timestamp
                lastmod = page.updated_at.isoformat() if page.updated_at else None

                sitemap_urls.append(
                    SitemapUrlItem(
                        url=url,
                        lastmod=lastmod,
                        changefreq="monthly",
                        priority=priority,
                    )
                )

        except Exception as e:
            logger.error(f"Error fetching pages for sitemap: {str(e)}")

        # Get all published and indexable blog posts
        try:
            blog_results = (
                db.query(BlogPostModel, BlogPostContentModel, LocaleModel)
                .join(
                    BlogPostContentModel,
                    BlogPostModel.id == BlogPostContentModel.post_id,
                )
                .join(LocaleModel, BlogPostContentModel.locale_id == LocaleModel.id)
                .filter(
                    BlogPostModel.organization_id == org_settings.id,
                    BlogPostContentModel.published == True,
                    BlogPostContentModel.seo_metadata_allow_indexing == True,
                )
                .all()
            )

            for post, content, locale in blog_results:
                # Construct URL based on language pattern: /[lang]/blog/slug
                url = f"/blog{post.slug}"
                if locale.iso_code != default_lang:
                    url = f"/{locale.iso_code}/blog{post.slug}"

                # Blog posts get higher change frequency and priority
                priority = "0.9"
                changefreq = "weekly"

                # Use post publish date or updated timestamp
                lastmod = None
                if post.publish_date:
                    lastmod = post.publish_date.isoformat()
                elif post.updated_at:
                    lastmod = post.updated_at.isoformat()

                sitemap_urls.append(
                    SitemapUrlItem(
                        url=url,
                        lastmod=lastmod,
                        changefreq=changefreq,
                        priority=priority,
                    )
                )

        except Exception as e:
            logger.error(f"Error fetching blog posts for sitemap: {str(e)}")

        # Sort by priority (highest first) then by URL
        sitemap_urls.sort(key=lambda x: (-float(x.priority), x.url))

        return SitemapResponse(urls=sitemap_urls, total=len(sitemap_urls))

    except Exception as e:
        logger.error(f"Error generating sitemap: {str(e)}")
        logger.error(f"Exception details: {type(e).__name__}: {e}")
        # Return empty sitemap on any error to prevent 500s
        return SitemapResponse(urls=[], total=0)
