"""Per-organization theme overlays.

Each org with at least one ``theme_file`` row for a given theme gets a full clone
of that theme at ``{data_dir}/themes/org_{id}/{theme_name}/``. The clone is then
overlaid with the org's edits (DB rows are the source of truth) and every
``.astro`` file has its ``data-theme="<theme>"`` attribute rewritten to
``data-theme="<theme>__<id>"`` so the per-theme PostCSS dispatch
(``client/postcss.config.js``) produces a matching ``[data-theme="<theme>__<id>"]``
scope.

A theme is rendered for an org from the clone only when overlays exist; orgs
without edits keep using the shared base path.
"""

import logging
import os
import re
import shutil

from .sync_utils import sync_directory

logger = logging.getLogger(__name__)

EXCLUDE_DIRS = {"node_modules", "dist", ".astro", ".git"}


def org_overlay_root(data_dir: str, org_id: int) -> str:
    return os.path.join(data_dir, "themes", f"org_{org_id}")


def org_theme_dir(
    data_dir: str, org_id: int, theme_name: str, lang_code: str | None = None
) -> str:
    base = org_overlay_root(data_dir, org_id)
    if lang_code:
        return os.path.join(base, lang_code, theme_name)
    return os.path.join(base, theme_name)


def base_theme_dir(data_dir: str, theme_name: str, lang_code: str | None = None) -> str:
    if lang_code:
        return os.path.join(data_dir, "themes", lang_code, theme_name)
    return os.path.join(data_dir, "themes", theme_name)


def ensure_org_theme_clone(
    data_dir: str, org_id: int, theme_name: str, lang_code: str | None = None
) -> str:
    """Mirror the base (or language-base) theme into the org's overlay dir.

    Uses :func:`sync_directory` so unchanged files are skipped and files removed
    from base disappear from the clone. Edited files are restored on top of this
    clone by the reconcile loop.
    """
    src = base_theme_dir(data_dir, theme_name, lang_code)
    dst = org_theme_dir(data_dir, org_id, theme_name, lang_code)
    if not os.path.exists(src):
        logger.warning(f"Base theme source not found, cannot clone for overlay: {src}")
        return dst
    os.makedirs(dst, exist_ok=True)
    sync_directory(src=src, dst=dst, exclude_dirs=EXCLUDE_DIRS)
    return dst


def rewrite_data_theme_attribute(file_path: str, theme_name: str, org_id: int) -> bool:
    """Rewrite ``data-theme="<theme_name>"`` → ``data-theme="<theme_name>__<id>"``
    in an .astro file. Returns True if the file was modified.

    Only matches the exact base theme name to avoid touching unrelated attributes.
    Single and double quotes are both handled.
    """
    if not file_path.endswith(".astro"):
        return False
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            original = f.read()
    except (IOError, OSError) as e:
        logger.warning(f"Could not read {file_path} for data-theme rewrite: {e}")
        return False

    new_value = f"{theme_name}__{org_id}"
    pattern = re.compile(r'(data-theme\s*=\s*)(["\'])' + re.escape(theme_name) + r"\2")
    updated = pattern.sub(
        lambda m: f"{m.group(1)}{m.group(2)}{new_value}{m.group(2)}", original
    )
    if updated == original:
        return False
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(updated)
    return True


def rewrite_data_theme_in_tree(tree_root: str, theme_name: str, org_id: int) -> int:
    """Walk ``tree_root`` and apply :func:`rewrite_data_theme_attribute` to every
    .astro file. Returns the count of files modified."""
    count = 0
    if not os.path.isdir(tree_root):
        return 0
    for dirpath, dirnames, filenames in os.walk(tree_root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fname in filenames:
            if fname.endswith(".astro"):
                full = os.path.join(dirpath, fname)
                if rewrite_data_theme_attribute(full, theme_name, org_id):
                    count += 1
    return count


def cleanup_stale_org_overlays(data_dir: str, active_org_ids: set[int]) -> None:
    """Remove ``themes/org_<id>/`` directories whose org has no theme_file rows."""
    themes_dir = os.path.join(data_dir, "themes")
    if not os.path.isdir(themes_dir):
        return
    for entry in os.listdir(themes_dir):
        if not entry.startswith("org_"):
            continue
        try:
            org_id = int(entry[len("org_") :])
        except ValueError:
            continue
        if org_id not in active_org_ids:
            stale = os.path.join(themes_dir, entry)
            shutil.rmtree(stale, ignore_errors=True)
            logger.info(f"Removed stale org overlay: {entry}")


def cleanup_stale_org_themes(
    data_dir: str,
    org_id: int,
    active_themes: set[str],
    active_langs_per_theme: dict[str, set[str]],
) -> None:
    """Remove subdirs of an org's overlay that no longer have any DB rows.

    ``active_themes`` is the set of theme_names the org has edits for.
    ``active_langs_per_theme`` maps theme_name -> set of lang_codes the org has edits for.
    """
    overlay = org_overlay_root(data_dir, org_id)
    if not os.path.isdir(overlay):
        return
    for entry in os.listdir(overlay):
        full = os.path.join(overlay, entry)
        if not os.path.isdir(full):
            continue
        # Could be a theme directory or a language directory
        if entry in active_themes:
            continue
        # If it looks like a language code dir, check whether any active theme uses this lang
        is_active_lang = any(
            entry in langs for langs in active_langs_per_theme.values()
        )
        if is_active_lang:
            # Prune themes inside the lang dir that aren't in active_langs_per_theme[theme]
            for theme_entry in os.listdir(full):
                theme_path = os.path.join(full, theme_entry)
                if not os.path.isdir(theme_path):
                    continue
                if entry not in active_langs_per_theme.get(theme_entry, set()):
                    shutil.rmtree(theme_path, ignore_errors=True)
                    logger.info(
                        f"Removed stale org overlay: org_{org_id}/{entry}/{theme_entry}"
                    )
            continue
        shutil.rmtree(full, ignore_errors=True)
        logger.info(f"Removed stale org overlay: org_{org_id}/{entry}")
