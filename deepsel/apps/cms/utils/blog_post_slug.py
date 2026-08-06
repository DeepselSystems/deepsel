import re
from typing import Optional
from sqlalchemy.orm import Session

from deepsel.utils.models_pool import models_pool


def check_valid_blog_post_slug(
    db: Session,
    slug: str,
    current_blog_post_id: int = None,
    organization_id: Optional[int] = None,
) -> bool:
    """
    Check if any other blog_post record has the same slug (blog slugs are
    shared across all languages of a post, unlike page_content's per-locale
    slug — so this checks the blog_post table directly, no locale_id).
    """
    BlogPostModel = models_pool["blog_post"]

    query = db.query(BlogPostModel).filter(BlogPostModel.slug == slug)

    if current_blog_post_id is not None:
        query = query.filter(BlogPostModel.id != current_blog_post_id)

    if organization_id is not None:
        query = query.filter(BlogPostModel.organization_id == organization_id)

    return query.first() is None


def check_blog_post_slug_with_conflict(
    db: Session,
    slug: str,
    current_blog_post_id: int = None,
    organization_id: Optional[int] = None,
):
    """
    Same as check_valid_blog_post_slug but also returns the conflicting
    blog_post record (or None) so callers can surface it.
    """
    BlogPostModel = models_pool["blog_post"]

    query = db.query(BlogPostModel).filter(BlogPostModel.slug == slug)

    if current_blog_post_id is not None:
        query = query.filter(BlogPostModel.id != current_blog_post_id)

    if organization_id is not None:
        query = query.filter(BlogPostModel.organization_id == organization_id)

    existing = query.first()
    return existing is None, existing


def generate_slug_from_blog_title(
    db: Session,
    title: str,
    max_length: int = 50,
    current_blog_post_id: int = None,
    organization_id: Optional[int] = None,
) -> str:
    """
    Generate slug for that title, e.g. Title = "Home Page" -> Slug = /home-page.
    Slug always starts with /. Appends a numeric suffix (-1, -2, ...) when the
    base slug is already taken by another blog_post, so two posts sharing a
    title never silently collide on the same slug.
    """
    if not title or not title.strip():
        return "/"

    slug = title.strip().lower()
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")

    max_base_length = max_length - 5
    if len(slug) > max_base_length:
        slug = slug[:max_base_length].rstrip("-")

    base_slug = f"/{slug}" if slug else "/"

    final_slug = base_slug
    counter = 1
    while not check_valid_blog_post_slug(
        db, final_slug, current_blog_post_id, organization_id
    ):
        final_slug = (
            "/" + str(counter) if base_slug == "/" else f"{base_slug}-{counter}"
        )
        counter += 1

    return final_slug
