import re
from sqlalchemy.orm import Session

from deepsel.utils.models_pool import models_pool


def check_valid_page_content_slug(
    db: Session, slug: str, locale_id: int, current_page_content_id: int = None
) -> bool:
    """
    Check if any page_content record with the same locale_id has the same slug.

    Args:
        slug (str): The slug to check for uniqueness
        locale_id (int): The locale ID to check within
        db: Database session
        current_page_content_id (int, optional): Current page content ID to exclude from validation (for updates)

    Returns:
        bool: True if slug is valid (not taken), False if slug already exists
    """
    # Get models
    PageContentModel = models_pool["page_content"]

    # Build query for existing page_content with same slug and locale_id
    query = db.query(PageContentModel).filter(
        PageContentModel.slug == slug, PageContentModel.locale_id == locale_id
    )

    # Exclude current page content if provided (for update scenarios)
    if current_page_content_id is not None:
        query = query.filter(PageContentModel.id != current_page_content_id)

    existing_content = query.first()

    # Return True if no existing content found (slug is valid)
    return existing_content is None


def check_page_content_slug_with_conflict(
    db: Session, slug: str, locale_id: int, current_page_content_id: int = None
):
    """
    Check if any page_content record with the same locale_id has the same slug.
    Returns both validation result and conflicting page content if found.

    Args:
        slug (str): The slug to check for uniqueness
        locale_id (int): The locale ID to check within
        db: Database session
        current_page_content_id (int, optional): Current page content ID to exclude from validation (for updates)

    Returns:
        tuple: (is_valid: bool, conflicting_page_content: PageContent or None)
               - is_valid: True if slug is valid (not taken), False if slug already exists
               - conflicting_page_content: The conflicting PageContent record if found, None otherwise
    """
    # Get models
    PageContentModel = models_pool["page_content"]

    # Build query for existing page_content with same slug and locale_id
    query = db.query(PageContentModel).filter(
        PageContentModel.slug == slug, PageContentModel.locale_id == locale_id
    )

    # Exclude current page content if provided (for update scenarios)
    if current_page_content_id is not None:
        query = query.filter(PageContentModel.id != current_page_content_id)

    existing_content = query.first()

    # Return validation result and conflicting content
    is_valid = existing_content is None
    return is_valid, existing_content


def generate_slug_from_title(
    db: Session,
    title: str,
    locale_id: int,
    max_length: int = 50,
    current_page_content_id: int = None,
) -> str:
    """
    Generate slug for that title. Eg. Title = Home Page → Slug = /home-page.
    Slug must always start with /. Also validates that the generated slug is unique.

    Args:
        db: Database session
        title (str): The title to convert to slug
        locale_id (int): The locale ID to check slug uniqueness within
        max_length (int, optional): Maximum length of the slug including the leading /. Defaults to 50.
        current_page_content_id (int, optional): Current page content ID to exclude from validation (for updates)

    Returns:
        str: Generated unique slug starting with / and containing only lowercase letters, numbers, and hyphens
    """
    if not title or not title.strip():
        return "/"

    # Convert to lowercase and strip whitespace
    slug = title.strip().lower()

    # Replace spaces and multiple whitespace with hyphens
    slug = re.sub(r"\s+", "-", slug)

    # Remove special characters except hyphens and alphanumeric
    slug = re.sub(r"[^a-z0-9-]", "", slug)

    # Remove multiple consecutive hyphens
    slug = re.sub(r"-+", "-", slug)

    # Remove leading/trailing hyphens
    slug = slug.strip("-")

    # Truncate slug if it's too long (accounting for leading / and potential counter)
    # Reserve space for potential counter suffix like "-999"
    max_base_length = max_length - 5  # Reserve 5 chars for counter
    if len(slug) > max_base_length:
        slug = slug[:max_base_length].rstrip("-")

    # Ensure slug starts with /
    if not slug:
        base_slug = "/"
    else:
        base_slug = f"/{slug}"

    # Check if the slug is valid (unique)
    final_slug = base_slug
    counter = 1

    # If slug is not valid, append counter until we find a unique one
    while not check_valid_page_content_slug(
        db, final_slug, locale_id, current_page_content_id
    ):
        if base_slug == "/":
            final_slug = f"/{counter}"
        else:
            final_slug = f"{base_slug}-{counter}"
        counter += 1

    return final_slug
