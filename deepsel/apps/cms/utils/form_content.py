import re
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool


def check_form_content_slug_with_conflict(
    db: Session,
    slug: str,
    locale_id: int,
    current_form_content_id: int = None,
) -> tuple[bool, object]:
    """
    Check if a form content slug conflicts with existing slugs in the database.

    Args:
        db: Database session
        slug: The slug to check
        locale_id: The locale ID for the slug
        current_form_content_id: ID of current form content (for updates, to exclude self)

    Returns:
        tuple: (is_valid, existing_content_or_none)
            - is_valid: True if slug is available, False if conflict exists
            - existing_content_or_none: The conflicting content object if conflict exists, None otherwise
    """
    FormContentModel = models_pool["form_content"]

    # Build query to find existing content with same slug and locale
    query = db.query(FormContentModel).filter(
        FormContentModel.slug == slug, FormContentModel.locale_id == locale_id
    )

    # Exclude current form content if this is an update operation
    if current_form_content_id:
        query = query.filter(FormContentModel.id != current_form_content_id)

    existing_content = query.first()

    if existing_content:
        return False, existing_content

    return True, None


def generate_slug_from_title(
    db: Session,
    title: str,
    locale_id: int,
    max_length: int = 50,
    current_form_content_id: int = None,
) -> str:
    """
    Generate a URL-friendly slug from a title, ensuring it starts with '/' and is unique.

    Args:
        db: Database session
        title: The title to convert to a slug
        locale_id: The locale ID for the slug
        max_length: Maximum length of the generated slug
        current_form_content_id: ID of current form content (for updates)

    Returns:
        str: Generated slug starting with '/'
    """
    if not title or not title.strip():
        return "/"

    # Convert to lowercase and replace spaces with hyphens
    slug = re.sub(r"[^\w\s-]", "", title).strip().lower()
    slug = re.sub(r"[\s-]+", "-", slug)

    # Ensure it starts with a letter and is within max length
    slug = re.sub(r"^[^a-z]+", "", slug)
    if len(slug) > max_length - 1:  # -1 to account for the leading '/'
        slug = slug[: max_length - 1].rstrip("-")

    # If the slug is empty after processing, use a default
    if not slug:
        slug = "form"

    # Ensure the slug is unique
    original_slug = f"/{slug}"  # Add leading slash
    slug = original_slug
    counter = 1

    while True:
        is_valid, _ = check_form_content_slug_with_conflict(
            db, slug, locale_id, current_form_content_id
        )
        if is_valid:
            break

        # Append a counter to make the slug unique
        counter_str = f"-{counter}"
        if len(slug) + len(counter_str) > max_length:
            slug = slug[: max_length - len(counter_str)] + counter_str
        else:
            slug = f"{slug}{counter_str}"
        counter += 1

    return slug
