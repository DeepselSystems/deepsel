"""Keep `client/src/pages/[...slug].astro` theme wiring in sync.

This utility updates only the dynamic theme sections of the Astro page (static theme
`import` lines, the `themeMap` block, and related default fallbacks) based on what is
present in the `themes/` directory.

The rest of `[...slug].astro` is treated as developer-authored source of truth and is
left untouched to avoid accidental overwrites.
"""

import os
import logging
import re
from .language_codes import get_valid_language_codes

logger = logging.getLogger(__name__)


def get_selected_theme_from_db() -> str | None:
    """Read selected_theme from the first organization in the DB."""
    try:
        from deepsel.deps import get_db_context
        from deepsel.utils.models_pool import models_pool

        CMSSettingsModel = models_pool.get("organization")
        if not CMSSettingsModel:
            return None
        with get_db_context() as db:
            org = db.query(CMSSettingsModel).first()
            return org.selected_theme if org else None
    except Exception as e:
        logger.warning(f"Could not read selected_theme from DB: {e}")
        return None


def get_all_active_themes_from_db() -> set[str]:
    """Collect selected_theme from ALL organizations in the DB."""
    try:
        from deepsel.deps import get_db_context
        from deepsel.utils.models_pool import models_pool

        CMSSettingsModel = models_pool.get("organization")
        if not CMSSettingsModel:
            return set()
        with get_db_context() as db:
            themes = set()
            for org in db.query(CMSSettingsModel).all():
                if org.selected_theme:
                    themes.add(org.selected_theme)
            return themes
    except Exception as e:
        logger.warning(f"Could not read active themes from DB: {e}")
        return set()


def get_org_overlay_themes_from_db() -> dict[int, set[str]]:
    """Return {organization_id: {theme_name, ...}} of orgs that have at least
    one theme_file overlay row for a given theme. Used to know which per-org
    themeMap entries to emit."""
    try:
        from deepsel.deps import get_db_context
        from deepsel.utils.models_pool import models_pool

        ThemeFileModel = models_pool.get("theme_file")
        if not ThemeFileModel:
            return {}
        with get_db_context() as db:
            rows = (
                db.query(ThemeFileModel.organization_id, ThemeFileModel.theme_name)
                .distinct()
                .all()
            )
            result: dict[int, set[str]] = {}
            for org_id, theme_name in rows:
                if org_id is None or not theme_name:
                    continue
                result.setdefault(org_id, set()).add(theme_name)
            return result
    except Exception as e:
        logger.warning(f"Could not read org overlay themes from DB: {e}")
        return {}


def _astro_files_in(directory: str) -> list[str]:
    """Sorted .astro filenames directly inside ``directory`` (non-recursive)."""
    if not os.path.isdir(directory):
        return []
    return sorted(
        f
        for f in os.listdir(directory)
        if f.endswith(".astro") and os.path.isfile(os.path.join(directory, f))
    )


def _lang_subdirs(directory: str, valid_language_codes: set[str]) -> list[str]:
    """Sorted immediate subdirs of ``directory`` named after a valid locale."""
    if not os.path.isdir(directory):
        return []
    return sorted(
        d
        for d in os.listdir(directory)
        if d in valid_language_codes and os.path.isdir(os.path.join(directory, d))
    )


def generate_theme_imports(data_dir_path: str, selected_theme: str | None = None):
    """
    Generate static imports for all theme variants in client/src/themes.ts
    This is idempotent and can be called multiple times safely.
    """
    try:
        themes_dir = os.path.join(data_dir_path, "themes")
        output_file = os.path.join(data_dir_path, "client/src/themes.ts")

        if not os.path.exists(themes_dir):
            logger.info(f"Themes directory not found: {themes_dir}")
            return

        # Get valid language codes from database
        valid_language_codes = get_valid_language_codes()

        # Read all folders in themes directory
        all_folders = [
            d
            for d in os.listdir(themes_dir)
            if os.path.isdir(os.path.join(themes_dir, d))
        ]

        # Ignore stale top-level language folders (legacy whole-theme clones);
        # per-language pages now live at themes/<theme>/<lang>/<file>.astro
        theme_folders = sorted(
            [f for f in all_folders if f not in valid_language_codes]
        )

        # Collect all themes actively used by any organization
        active_themes = get_all_active_themes_from_db()
        if selected_theme:
            active_themes.add(selected_theme)
        if active_themes:
            available = [t for t in theme_folders if t in active_themes]
            if available:
                theme_folders = available
            else:
                logger.warning(
                    f"Active themes {active_themes} not found on disk. "
                    f"Falling back to all themes: {theme_folders}"
                )

        # System keys mapping (matches themeSystemKeys in themes.ts)
        system_key_mapping = {
            "index": "Home",
            "page": "Page",
            "blog": "BlogList",
            "single-blog": "BlogPost",
            "search": "SearchResults",
            "404": "NotFound",
        }

        # Generate imports + theme map entries
        imports: list[str] = []
        theme_map_entries: dict[str, dict[str, str]] = {}

        def _to_component_name(
            theme: str, filename: str, lang_suffix: str = "", org_suffix: str = ""
        ) -> str:
            # Convert theme name to PascalCase (handles hyphens and underscores)
            theme_part = "".join(word.capitalize() for word in re.split(r"[-_]", theme))
            file_base = filename[:-6] if filename.endswith(".astro") else filename
            page_part = file_base.capitalize().replace("-", "")
            return f"{theme_part}{org_suffix}{lang_suffix}{page_part}"

        # Scan all .astro files in each theme folder
        for theme in theme_folders:
            theme_path = os.path.join(themes_dir, theme)
            astro_files = _astro_files_in(theme_path)

            if theme not in theme_map_entries:
                theme_map_entries[theme] = {}

            for astro_file in astro_files:
                page_key = astro_file[:-6].lower()  # remove .astro, lowercase
                component_name = _to_component_name(theme, astro_file)
                import_path = f"../../themes/{theme}/{astro_file}"
                imports.append(f'import {component_name} from "{import_path}";')

                # Use system key if available, otherwise use page_key
                system_key = system_key_mapping.get(page_key, page_key)
                theme_map_entries[theme][system_key] = component_name

            # Per-language pages: themes/<theme>/<lang>/<file>.astro. These are
            # emitted under a '<lang>:<key>' map key (key is the literal system
            # key value, e.g. 'de:index', which the client tries before the
            # theme-root fallback).
            for lang in _lang_subdirs(theme_path, valid_language_codes):
                lang_path = os.path.join(theme_path, lang)
                lang_suffix = lang.capitalize().replace("_", "").replace("@", "")
                for astro_file in _astro_files_in(lang_path):
                    page_key = astro_file[:-6].lower()
                    component_name = _to_component_name(theme, astro_file, lang_suffix)
                    import_path = f"../../themes/{theme}/{lang}/{astro_file}"
                    imports.append(f'import {component_name} from "{import_path}";')
                    theme_map_entries[theme][f"{lang}:{page_key}"] = component_name

        # Per-org overlay entries: themeMap['<theme>__<org_id>'] points at the
        # org's cloned tree (themes/org_<id>/<theme>/...). Reconcile produces a
        # full clone of the base, so we just scan that dir for .astro files.
        org_overlays = get_org_overlay_themes_from_db()
        for org_id, overlay_themes in org_overlays.items():
            for theme in overlay_themes:
                overlay_dir = os.path.join(themes_dir, f"org_{org_id}", theme)
                if not os.path.isdir(overlay_dir):
                    logger.warning(
                        f"Overlay dir missing for org {org_id} theme {theme}; "
                        f"skipping themeMap entry"
                    )
                    continue
                map_key = f"{theme}__{org_id}"
                theme_map_entries.setdefault(map_key, {})
                org_suffix = f"Org{org_id}"

                for astro_file in _astro_files_in(overlay_dir):
                    page_key = astro_file[:-6].lower()
                    component_name = _to_component_name(
                        theme, astro_file, org_suffix=org_suffix
                    )
                    import_path = f"../../themes/org_{org_id}/{theme}/{astro_file}"
                    imports.append(f'import {component_name} from "{import_path}";')
                    system_key = system_key_mapping.get(page_key, page_key)
                    theme_map_entries[map_key][system_key] = component_name

                # Per-language pages inside the overlay:
                # themes/org_<id>/<theme>/<lang>/<file>.astro
                for lang in _lang_subdirs(overlay_dir, valid_language_codes):
                    lang_overlay_dir = os.path.join(overlay_dir, lang)
                    lang_suffix = lang.capitalize().replace("_", "").replace("@", "")
                    for astro_file in _astro_files_in(lang_overlay_dir):
                        page_key = astro_file[:-6].lower()
                        component_name = _to_component_name(
                            theme, astro_file, lang_suffix, org_suffix
                        )
                        import_path = (
                            f"../../themes/org_{org_id}/{theme}/{lang}/{astro_file}"
                        )
                        imports.append(f'import {component_name} from "{import_path}";')
                        theme_map_entries[map_key][
                            f"{lang}:{page_key}"
                        ] = component_name

        # Generate theme map code
        theme_map_lines = ["export const themeMap = {"]
        for theme, variants in theme_map_entries.items():
            theme_map_lines.append(f"  '{theme}': {{")
            for variant, component_name in variants.items():
                # Use themeSystemKeys reference for system keys
                if variant in [
                    "Home",
                    "Page",
                    "BlogList",
                    "BlogPost",
                    "SearchResults",
                    "NotFound",
                ]:
                    theme_map_lines.append(
                        f"    [themeSystemKeys.{variant}]: {component_name},"
                    )
                else:
                    theme_map_lines.append(f"    '{variant}': {component_name},")
            theme_map_lines.append("  },")
        theme_map_lines.append("};")
        theme_map_code = "\n".join(theme_map_lines)

        # Generate themes.ts file content
        file_content = f"""// THEME_IMPORTS_START (auto-managed)
{chr(10).join(imports)}
// THEME_IMPORTS_END


export const themeSystemKeys = {{
  Home: 'index',
  Page: 'page',
  BlogList: 'blog',
  BlogPost: 'single-blog',
  SearchResults: 'search',
  NotFound: '404',
}};


// THEME_MAP_START (auto-managed)
{theme_map_code}
// THEME_MAP_END

export type ThemeName = keyof typeof themeMap;
"""

        # Write or update themes.js file
        os.makedirs(os.path.dirname(output_file), exist_ok=True)

        if os.path.exists(output_file):
            with open(output_file, "r", encoding="utf-8") as f:
                existing = f.read()

            updated = _patch_themes_ts(
                content=existing,
                import_lines=imports,
                theme_map_code=theme_map_code,
            )

            if updated != existing:
                with open(output_file, "w", encoding="utf-8") as f:
                    f.write(updated)
                logger.info(f"Updated themes.ts with {len(imports)} imports")
            # else:
            # logger.info("No changes needed for themes.ts")

        else:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(file_content)
            logger.info(f"Created themes.ts with {len(imports)} imports")

    except Exception as e:
        logger.error(f"Error generating theme imports: {e}")
        import traceback

        traceback.print_exc()


def _replace_between_markers(
    text: str, start_marker: str, end_marker: str, replacement: str
) -> tuple[str, bool]:
    start_idx = text.find(start_marker)
    if start_idx == -1:
        return text, False
    start_line_end = text.find("\n", start_idx)
    if start_line_end == -1:
        return text, False

    end_idx = text.find(end_marker, start_line_end + 1)
    if end_idx == -1:
        return text, False
    end_line_start = text.rfind("\n", 0, end_idx)
    if end_line_start == -1:
        end_line_start = end_idx
    else:
        end_line_start = end_line_start + 1

    new_text = text[: start_line_end + 1] + replacement + text[end_line_start:]
    return new_text, True


def _patch_themes_ts(
    *,
    content: str,
    import_lines: list[str],
    theme_map_code: str,
) -> str:
    updated = content

    new_import_block = "\n".join(import_lines) + "\n"
    updated, _ = _replace_between_markers(
        updated,
        "// THEME_IMPORTS_START (auto-managed)",
        "// THEME_IMPORTS_END",
        new_import_block,
    )

    updated, _ = _replace_between_markers(
        updated,
        "// THEME_MAP_START (auto-managed)",
        "// THEME_MAP_END",
        theme_map_code + "\n",
    )

    return updated


def generate_tailwind_config(data_dir_path: str, selected_theme: str | None = None):
    """No-op: the client now dispatches Tailwind per-theme via postcss based on
    source file paths. client/tailwind.config.js is hand-maintained as a base
    config for client/src/. See client/postcss.config.js."""
    return
