import os
import logging

logger = logging.getLogger(__name__)

SYSTEM_KEYS = {"index", "page", "blog", "single-blog", "search", "404"}


def get_theme_page_slugs(theme_name: str) -> list[str]:
    """
    Return slugs claimed by the theme's custom pages + homepage.

    Scans the theme directory for .astro files, filters out system templates,
    and returns slugs like ["/", "/finance", "/about"].

    The homepage "/" is always included (maps to index.astro).
    """
    from ..routers.theme import _resolve_theme_path

    if not theme_name:
        return []

    theme_path = _resolve_theme_path(theme_name)
    if not theme_path:
        logger.warning(f"Theme '{theme_name}' not found")
        return []

    slugs = []

    try:
        for filename in os.listdir(theme_path):
            if not filename.endswith(".astro") or not os.path.isfile(
                os.path.join(theme_path, filename)
            ):
                continue

            key = filename[:-6].lower()  # remove .astro, lowercase

            if key == "index":
                slugs.insert(0, "/")  # index.astro = homepage
            elif key not in SYSTEM_KEYS:
                slugs.append(f"/{key}")
    except Exception as e:
        logger.error(f"Error scanning theme pages for '{theme_name}': {e}")

    return slugs


def slug_to_theme_filename(slug: str) -> str:
    """
    Convert a slug back to a theme .astro filename.
    "/" -> "Index.astro", "/finance" -> "finance.astro"
    """
    if slug == "/":
        return "Index.astro"
    return f"{slug.lstrip('/')}.astro"
