from .attachment_utils import resolve_attachment_locale_version
from .domain_detection import detect_domain_from_request
from .render_wysiwyg_content import render_wysiwyg_content
import logging
from fastapi import HTTPException, status, Request
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool
from pydantic import BaseModel, ConfigDict
from ..types.seo import SEOMetadata
from ..types.public_settings import PublicSettings

logger = logging.getLogger(__name__)


class PageContentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str | None
    slug: str
    lang: str
    public_settings: PublicSettings
    seo_metadata: SEOMetadata
    # other languages available for this page
    language_alternatives: list[dict]
    # Custom code fields
    page_custom_code: str | None = None
    custom_code: str | None = None
    # Access control
    require_login: bool


def get_page_content(
    request: Request,
    lang: str,
    slug: str,
    preview: bool,
    db: Session,
    current_user,
    org_id: int = None,
) -> PageContentResponse:
    """Get page content by language and slug"""

    # Add a leading slash to the slug if it doesn't have one
    if slug == "default":
        slug = "/"
    if not slug.startswith("/"):
        slug = f"/{slug}"

    LocaleModel = models_pool["locale"]
    OrganizationModel = models_pool["organization"]

    # Use explicit org_id if provided (preview from admin), otherwise detect by domain
    if org_id:
        org_settings = db.query(OrganizationModel).get(org_id)
    else:
        domain = detect_domain_from_request(request)
        org_settings = OrganizationModel.find_organization_by_domain(domain, db)

    if not org_settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
        )

    # Preview requires org membership — covers both org_id and domain-detected paths.
    # Public SSR intentionally uses membership (not _check_has_permission) as the
    # authorization boundary; the CRUD permission layer applies to admin routes only.
    if preview and current_user:
        user_org_ids = {org.id for org in getattr(current_user, "organizations", [])}
        if org_settings.id not in user_org_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No permission to preview this organization's content",
            )

    # Determine default language
    default_lang = (
        org_settings.default_language.iso_code if org_settings and org_settings.default_language else None
    )

    # Find content by language-specific slug
    # Find the locale ID for the requested language
    locale = None
    if lang == "default":
        default_lang = (
            org_settings.default_language.iso_code
            if org_settings and org_settings.default_language
            else None
        )
        locale = (
            db.query(LocaleModel).filter(LocaleModel.iso_code == default_lang).first()
        )
    else:
        locale = db.query(LocaleModel).filter(LocaleModel.iso_code == lang).first()

    if locale:
        PageModel = models_pool["page"]
        PageContentModel = models_pool["page_content"]

        # Build query filters
        query_filters = [
            PageContentModel.slug == slug,
            PageContentModel.locale_id == locale.id,
            PageModel.organization_id == org_settings.id,
        ]

        # Only filter by published status if not in preview mode or not authenticated.
        # Publish state lives per-language on the content row.
        if not preview or not current_user:
            query_filters.append(PageContentModel.published == True)

        # Try to find content with matching language-specific slug
        matching_content = (
            db.query(PageContentModel)
            .join(PageModel, PageContentModel.page_id == PageModel.id)
            .filter(*query_filters)
            .first()
        )

        # If no content found for requested language, try default language
        if not matching_content and lang != "default" and org_settings.default_language:
            # Build query filters for default language
            default_query_filters = [
                PageContentModel.slug == slug,
                PageContentModel.locale_id == org_settings.default_language.id,
                PageModel.organization_id == org_settings.id,
            ]

            # Only filter by published status if not in preview mode or not authenticated
            if not preview or not current_user:
                default_query_filters.append(PageContentModel.published == True)

            matching_content = (
                db.query(PageContentModel)
                .join(PageModel, PageContentModel.page_id == PageModel.id)
                .filter(*default_query_filters)
                .first()
            )

        if matching_content:
            page = matching_content.page

            # Check if login is required for this page
            if page.require_login and not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                )

            # Get public settings (menus are always included)
            settings = org_settings.get_public_settings(
                org_settings.id,  # Use detected organization
                db,
                lang=lang if lang != "default" else default_lang,
            )

            # Render wysiwyg content with Jinja2
            rendered_content = render_wysiwyg_content(
                matching_content,
                org_settings.id,
                db,
                (
                    org_settings.default_language.id
                    if org_settings.default_language
                    else None
                ),
                current_user,
            )

            # Prepare response data
            response_data = {
                "id": page.id,
                "title": matching_content.title,
                "content": rendered_content,
                "slug": matching_content.slug,
                "lang": lang if lang != "default" else default_lang,
                "public_settings": settings,
                "seo_metadata": {
                    "title": matching_content.seo_metadata_title
                    or matching_content.title,
                    "description": matching_content.seo_metadata_description,
                    "featured_image_id": matching_content.seo_metadata_featured_image_id,
                    "featured_image_name": (
                        matching_content.seo_metadata_featured_image.name
                        if matching_content.seo_metadata_featured_image
                        else None
                    ),
                    "featured_image_version_name": getattr(
                        resolve_attachment_locale_version(
                            matching_content.seo_metadata_featured_image,
                            lang if lang != "default" else default_lang,
                        ),
                        "name",
                        None,
                    ),
                    "allow_indexing": matching_content.seo_metadata_allow_indexing,
                },
                "custom_code": matching_content.custom_code,
                "require_login": page.require_login,
                "language_alternatives": [
                    {
                        "slug": content.slug,
                        "locale": {
                            "id": content.locale.id,
                            "name": content.locale.name,
                            "iso_code": content.locale.iso_code,
                        },
                    }
                    for content in page.contents
                    if content.published or (preview and current_user)
                ],
            }

            return response_data

    # No matching content found with the specified slug
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page not found")
