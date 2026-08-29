"""Auto-generates language-switching wrapper components for theme files that
have per-language variants (e.g. ``en/components/Menu.tsx`` next to
``components/Menu.tsx``).

Problem this solves: the theme editor lets an admin create a per-language
version of ANY file in a theme, at any depth (``file_path`` is validated as an
arbitrary theme-relative path, see ``_validate_theme_file_path`` in
``routers/theme.py``). That works for page-level templates (``Index.astro``,
``kontakt.astro``, ...) because the client resolves those through
``themeMap`` (see ``theme_imports.py``) by language at request time. But a
*shared component* used inside those templates (``components/Menu.tsx``,
``components/Footer.astro``) is only ever reached through a plain, static
``import`` written by the theme author — which always resolves to the same
file regardless of which language the visitor is viewing.

This module closes that gap without requiring the theme author to write or
know about any resolution logic: whenever a shared component has at least one
language variant, this function renames the original file to
``<name>.base.<ext>`` and writes a small switcher at the *original* path that
picks the right variant by language at render time. Because the switcher is
installed at the exact path the theme's own ``import`` statements already
point to, no theme source file (``import Header from "./Menu"``, `import
Footer from "./components/Footer.astro"``, ...) ever needs to change.

For ``.tsx`` components, language comes from ``useLanguage()``
(``@deepsel/cms-react``), which reads it from ``WebsiteDataProvider`` context.
For ``.astro`` components, language comes from ``Astro.params``/``Astro.url``
directly — confirmed empirically that these propagate correctly to nested
``.astro`` components with zero props passed, even several levels deep, since
Astro's per-request globals are not scoped to the top-level route file.

This module only ever mutates an already-materialized theme tree on disk (an
org overlay directory, or a validate-build's temp-dir clone of one) — never
the git-tracked ``themes/<theme>/`` source tree, and never the DB. It must be
called from both the real reconcile pass (``reconcile_theme_overlays``) and
the isolated validate-build pass (``validate_theme_build``), so the build
that gates a save and the build that actually ships stay in sync — see
``theme_imports.generate_theme_imports`` for the existing precedent of a
codegen step called from both places.
"""

import logging
import os
import re

from .language_codes import get_valid_language_codes

logger = logging.getLogger(__name__)

# First line written to every generated switcher file — also the idempotency
# marker: its presence identifies a path as a previously-generated switcher
# rather than theme-author-owned content, so re-running this function never
# mistakes a switcher for a new "base" file to rename.
SWITCHER_MARKER_TEXT = "AUTO-GENERATED THEME LANGUAGE SWITCHER — do not edit."

SWITCHABLE_EXTENSIONS = (".tsx", ".astro")

IMPLEMENTED_EXTENSIONS = (".tsx", ".astro")


def _is_lang_dir(name: str, valid_language_codes: set) -> bool:
    return name in valid_language_codes


def _base_sibling_path(relative_path: str) -> str:
    """``components/Menu.tsx`` -> ``components/Menu.base.tsx``."""
    root, ext = os.path.splitext(relative_path)
    return f"{root}.base{ext}"


def _is_base_sibling_name(filename: str) -> bool:
    return any(filename.endswith(f".base{ext}") for ext in SWITCHABLE_EXTENSIONS)


def _original_path_from_base_sibling(relative_path: str) -> str:
    """``components/Menu.base.tsx`` -> ``components/Menu.tsx``."""
    root, ext = os.path.splitext(relative_path)  # root="components/Menu.base"
    assert root.endswith(".base")
    return f"{root[: -len('.base')]}{ext}"


def _has_switcher_marker(file_path: str) -> bool:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            head = f.read(200)
    except (IOError, OSError):
        return False
    return SWITCHER_MARKER_TEXT in head


def _discover_original_relative_paths(
    theme_root: str, valid_language_codes: set
) -> set:
    """Every base-file identity under ``theme_root``, whether it currently
    lives at its original path (untouched so far) or has already been moved
    to ``<name>.base.<ext>`` by a previous run of this function. Never
    recurses into a language-code-named directory — those hold variants, not
    base files.

    Also skips files directly at ``theme_root`` (depth 0) — those are the
    page-level templates (``Index.astro``, ``page.astro``, ``kontakt.astro``,
    ...) that ``generate_theme_imports()`` (``theme_imports.py``) scans
    non-recursively to build ``client/src/themes.ts``, and which the client
    already language-resolves via ``themeMap`` at request time (see this
    module's docstring). They must never get a switcher installed: renaming
    one to ``<name>.base.<ext>`` would leave a stray sibling file in the very
    directory ``generate_theme_imports()`` scans, which has no way to
    distinguish it from a real page template and blindly emits an `import`
    for it — with an invalid, unsanitized identifier (confirmed live: a
    variant added for ``page.astro`` produced a broken ``AlcorisOrg1Page.base``
    identifier in ``themes.ts``, breaking the entire build). Only files
    nested at least one directory deep (``components/...``) are exclusively
    reached through the theme's own static imports and actually need this."""
    originals = set()
    for dirpath, dirnames, filenames in os.walk(theme_root):
        dirnames[:] = [d for d in dirnames if not _is_lang_dir(d, valid_language_codes)]
        rel_dir = os.path.relpath(dirpath, theme_root)
        if rel_dir == ".":
            continue
        for fname in filenames:
            if not fname.endswith(SWITCHABLE_EXTENSIONS):
                continue
            rel_path = os.path.join(rel_dir, fname).replace(os.sep, "/")
            if _is_base_sibling_name(fname):
                originals.add(_original_path_from_base_sibling(rel_path))
            else:
                originals.add(rel_path)
    return originals


def _find_lang_variants(
    theme_root: str, original_relative_path: str, valid_language_codes: set
) -> list:
    """Sorted lang codes that have a sibling file at
    ``<lang>/<original_relative_path>`` under ``theme_root``."""
    found = []
    for lang in sorted(valid_language_codes):
        candidate = os.path.join(theme_root, lang, original_relative_path)
        if os.path.isfile(candidate):
            found.append(lang)
    return found


def _relative_import(from_dir: str, to_path_no_ext: str) -> str:
    """Build a relative import specifier for a module at ``to_path_no_ext``
    (relative to ``theme_root``, no extension) as seen from a file living in
    ``from_dir`` (also relative to ``theme_root``)."""
    rel = os.path.relpath(to_path_no_ext, start=from_dir or ".")
    rel = rel.replace(os.sep, "/")
    if not rel.startswith("."):
        rel = f"./{rel}"
    return rel


def _sanitize_identifier(text: str) -> str:
    """Turn a filename/lang code into a safe, unique-enough JS identifier
    fragment, e.g. ``en-US`` -> ``EnUs``, ``Menu`` -> ``Menu``."""
    parts = re.split(r"[^a-zA-Z0-9]+", text)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def _generate_tsx_switcher(original_relative_path: str, lang_variants: list) -> str:
    """Build the source of a ``.tsx`` switcher component that picks between
    the default-language (base) implementation and each language variant
    using ``useLanguage()`` at render time."""
    switcher_dir = os.path.dirname(original_relative_path)
    root, _ext = os.path.splitext(original_relative_path)
    base_no_ext = f"{root}.base"
    base_import = _relative_import(switcher_dir, base_no_ext)

    component_name = _sanitize_identifier(os.path.basename(root)) or "ThemeComponent"

    variant_imports = []
    case_lines = []
    for lang in lang_variants:
        lang_no_ext, _ = os.path.splitext(os.path.join(lang, original_relative_path))
        lang_import = _relative_import(switcher_dir, lang_no_ext.replace(os.sep, "/"))
        # A leading double-underscore (e.g. "__De") is a valid JS identifier
        # and works fine as a React/JSX component reference (confirmed: the
        # .tsx switcher passed end-to-end with this naming) but trips up
        # Astro's own template compiler for .astro files (see
        # _generate_astro_switcher) -- kept underscore-free here too for one
        # consistent, safe-everywhere naming scheme across both generators.
        ident = f"Variant{_sanitize_identifier(lang)}"
        variant_imports.append(f"import {ident} from '{lang_import}';")
        case_lines.append(f"    case '{lang}':\n      return <{ident} {{...props}} />;")

    variant_imports_block = "\n".join(variant_imports)
    case_lines_block = "\n".join(case_lines)

    return f"""// {SWITCHER_MARKER_TEXT}
// Source of truth for the default-language content is '{os.path.basename(base_no_ext)}{_ext}'
// in this same directory. Edit language variants via the Theme Editor, not this file —
// it is regenerated every time the theme is reconciled.
import {{ useLanguage }} from '@deepsel/cms-react';
import VariantBase from '{base_import}';
{variant_imports_block}

export default function {component_name}(props: any) {{
  const {{ language }} = useLanguage();
  switch (language) {{
{case_lines_block}
    default:
      return <VariantBase {{...props}} />;
  }}
}}
"""


def _generate_astro_switcher(original_relative_path: str, lang_variants: list) -> str:
    """Build the source of an ``.astro`` switcher component that picks
    between the default-language (base) implementation and each language
    variant. ``.astro`` components have no React context to read language
    from — instead this derives it straight from ``Astro.params``/
    ``Astro.url`` the same way the top-level route (``[...slug].astro``)
    does, via ``parseSlug()``. Confirmed empirically (isolated Astro spike)
    that these request-scoped globals propagate correctly to nested ``.astro``
    components with zero props passed, several levels deep — this only holds
    because every route in this app funnels through the single catch-all
    ``[...slug].astro``, so ``Astro.params`` always exposes exactly one
    ``slug`` rest param, whatever the currently-rendering theme template is.

    Unlike ``.tsx`` imports (extension omitted), ``.astro`` imports in this
    codebase always keep the ``.astro`` suffix — see e.g. ``import Footer
    from "./components/Footer.astro"`` in the theme's own page templates.
    """
    switcher_dir = os.path.dirname(original_relative_path)
    root, ext = os.path.splitext(original_relative_path)
    base_no_ext = f"{root}.base"
    base_import = _relative_import(switcher_dir, base_no_ext) + ext

    variant_imports = []
    conditions = []
    for lang in lang_variants:
        lang_no_ext, _ = os.path.splitext(os.path.join(lang, original_relative_path))
        lang_import = (
            _relative_import(switcher_dir, lang_no_ext.replace(os.sep, "/")) + ext
        )
        # Astro's template compiler misparses a leading-double-underscore tag
        # name (e.g. "<__De ... />") as an attempt to add attributes to its
        # "<>" Fragment shorthand, raising "Unable to assign attributes when
        # using <> Fragment shorthand syntax!" -- confirmed via a real build
        # failure. React/JSX (the .tsx generator) has no such issue with the
        # same naming, but this generator avoids the underscore prefix
        # entirely to not depend on that difference.
        ident = f"Variant{_sanitize_identifier(lang)}"
        variant_imports.append(f"import {ident} from '{lang_import}';")
        conditions.append(f"lang === '{lang}' ? <{ident} {{...Astro.props}} /> :")

    variant_imports_block = "\n".join(variant_imports)
    condition_chain = "\n  ".join(conditions)

    return f"""---
// {SWITCHER_MARKER_TEXT}
// Source of truth for the default-language content is '{os.path.basename(base_no_ext)}{ext}'
// in this same directory. Edit language variants via the Theme Editor, not this file —
// it is regenerated every time the theme is reconciled.
import {{ parseSlug }} from '@deepsel/cms-utils';
import VariantBase from '{base_import}';
{variant_imports_block}

const {{ slug = '/' }} = Astro.params;
const {{ lang }} = parseSlug(slug);
---
{{{condition_chain}
  <VariantBase {{...Astro.props}} />}}
"""


def _generate_switcher_content(original_relative_path: str, lang_variants: list) -> str:
    _root, ext = os.path.splitext(original_relative_path)
    if ext == ".tsx":
        return _generate_tsx_switcher(original_relative_path, lang_variants)
    if ext == ".astro":
        return _generate_astro_switcher(original_relative_path, lang_variants)
    raise NotImplementedError(
        f"Switcher generation for '{ext}' files is not implemented yet "
        f"(path: {original_relative_path})"
    )


def generate_component_switchers(theme_root: str) -> None:
    """Scan ``theme_root`` (an already fully-materialized theme tree — base
    files mirrored in, DB-edited content and language variants written) and
    make sure every base file that has at least one language variant is
    reachable through a switcher at its original import path, restoring
    plain files whose last variant was removed.

    Idempotent and safe to call on every reconcile: re-running it against an
    unchanged tree is a no-op; re-running it after variants were added or
    removed converges to the correct state.
    """
    if not os.path.isdir(theme_root):
        return

    valid_language_codes = get_valid_language_codes()
    if not valid_language_codes:
        return

    for original_relative_path in sorted(
        _discover_original_relative_paths(theme_root, valid_language_codes)
    ):
        _root, ext = os.path.splitext(original_relative_path)
        if ext not in IMPLEMENTED_EXTENSIONS:
            continue

        lang_variants = _find_lang_variants(
            theme_root, original_relative_path, valid_language_codes
        )

        original_abs = os.path.join(theme_root, original_relative_path)
        base_relative_path = _base_sibling_path(original_relative_path)
        base_abs = os.path.join(theme_root, base_relative_path)

        switcher_currently_installed = os.path.isfile(
            base_abs
        ) and _has_switcher_marker(original_abs)

        if lang_variants:
            if not switcher_currently_installed:
                if not os.path.isfile(original_abs):
                    # Base file missing entirely (e.g. only variants exist) —
                    # nothing to switch between a base and; skip.
                    continue
                os.rename(original_abs, base_abs)
                logger.info(
                    f"Renamed '{original_relative_path}' -> '{base_relative_path}' "
                    f"to make way for a language switcher"
                )
            switcher_content = _generate_switcher_content(
                original_relative_path, lang_variants
            )
            with open(original_abs, "w", encoding="utf-8") as f:
                f.write(switcher_content)
        else:
            if switcher_currently_installed:
                os.replace(base_abs, original_abs)
                logger.info(
                    f"Restored '{original_relative_path}' from "
                    f"'{base_relative_path}' — no language variants remain"
                )
