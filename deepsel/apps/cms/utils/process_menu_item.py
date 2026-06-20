from typing import Iterable, Optional
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool
from ..types.menu import MenuItem

LocalizedMenuItem = MenuItem


def build_localized_menus(
    menu_items: Iterable, lang: Optional[str], db: Session
) -> list[LocalizedMenuItem]:
    """Return menu data localized for the requested lang in a single pass."""

    if not lang:
        return []

    menu_items = list(menu_items or [])
    if not menu_items:
        return []

    page_content_map = _build_page_content_map(menu_items, lang, db)

    def _localize_menu(item) -> Optional[LocalizedMenuItem]:
        translations = getattr(item, "translations", {}) or {}
        translation = translations.get(lang)
        if not translation:
            return None

        use_custom_url = translation.get("use_custom_url", False)
        page_content_id = translation.get("page_content_id")
        use_page_title = translation.get("use_page_title", True)
        url = translation.get("url", "") or ""
        title = translation.get("title", "") or ""

        if not use_custom_url and page_content_id:
            page_data = page_content_map.get(page_content_id)
            if page_data:
                url = page_data["slug"]
                if use_page_title:
                    title = page_data["title"]

        children: list[LocalizedMenuItem] = []
        for child in getattr(item, "children", []) or []:
            localized_child = _localize_menu(child)
            if localized_child:
                children.append(localized_child)

        if children:
            children.sort(key=lambda entry: entry.position)

        return LocalizedMenuItem(
            id=item.id,
            position=item.position,
            title=title,
            url=url,
            open_in_new_tab=translation.get("open_in_new_tab", False),
            children=children,
        )

    localized_menus: list[LocalizedMenuItem] = []
    for item in menu_items:
        localized_item = _localize_menu(item)
        if localized_item:
            localized_menus.append(localized_item)

    return localized_menus


def _build_page_content_map(
    menu_items: list, lang: str, db: Session
) -> dict[int, dict]:
    """Collect relevant page_content_ids and fetch them in bulk."""

    page_content_ids = set()

    def _collect(item):
        translations = getattr(item, "translations", {}) or {}
        translation = translations.get(lang)
        if translation:
            use_custom_url = translation.get("use_custom_url", False)
            page_content_id = translation.get("page_content_id")
            if not use_custom_url and page_content_id:
                page_content_ids.add(page_content_id)

        for child in getattr(item, "children", []) or []:
            _collect(child)

    for menu_item in menu_items:
        _collect(menu_item)

    if not page_content_ids:
        return {}

    PageContentModel = models_pool.get("page_content")
    page_contents = (
        db.query(PageContentModel.id, PageContentModel.title, PageContentModel.slug)
        .filter(PageContentModel.id.in_(page_content_ids))
        .all()
    )

    return {
        content.id: {"title": content.title or "", "slug": content.slug or ""}
        for content in page_contents
    }
