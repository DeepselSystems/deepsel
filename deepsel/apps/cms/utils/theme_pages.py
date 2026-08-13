import os
import logging

logger = logging.getLogger(__name__)

SYSTEM_KEYS = {"index", "page", "blog", "single-blog", "search", "404"}


def get_theme_page_slugs(theme_name: str) -> list[str]:
    """
    Return slugs claimed by the theme's custom pages + homepage.

    Scans the theme directory for .astro files, filters out system templates,
    and returns slugs like ["/", "/finance", "/about"].

    Per-language pages (``<theme>/<lang>/<file>.astro``) claim the same slug as
    their root counterpart, so their slugs are unioned in with the lang prefix
    stripped — a page that only exists as language variants still blocks a
    colliding DB page slug.

    The homepage "/" is always included (maps to index.astro).
    """
    from ..routers.theme import _resolve_theme_path
    from .language_codes import get_valid_language_codes

    if not theme_name:
        return []

    theme_path = _resolve_theme_path(theme_name)
    if not theme_path:
        logger.warning(f"Theme '{theme_name}' not found")
        return []

    slugs = []
    has_index = False

    def _collect(directory: str):
        nonlocal has_index
        for filename in os.listdir(directory):
            if not filename.endswith(".astro") or not os.path.isfile(
                os.path.join(directory, filename)
            ):
                continue

            key = filename[:-6].lower()  # remove .astro, lowercase

            if key == "index":
                has_index = True
            elif key not in SYSTEM_KEYS and f"/{key}" not in slugs:
                slugs.append(f"/{key}")

    try:
        _collect(theme_path)

        valid_language_codes = get_valid_language_codes()
        for entry in sorted(os.listdir(theme_path)):
            lang_dir = os.path.join(theme_path, entry)
            if entry in valid_language_codes and os.path.isdir(lang_dir):
                _collect(lang_dir)

        if has_index:
            slugs.insert(0, "/")  # index.astro = homepage
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
