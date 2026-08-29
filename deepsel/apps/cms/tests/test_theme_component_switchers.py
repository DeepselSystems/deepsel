"""Tests for generate_component_switchers() -- see theme_component_switchers.py
for the problem this solves (shared theme components like Menu.tsx/Footer.astro
are only ever reached through a plain, static import, so a per-language variant
created via the Theme Editor is otherwise never picked up at render time).

These tests stub get_valid_language_codes() (DB-backed) to a fixed set so the
bulk of the suite runs without a Postgres testcontainer -- the actual behavior
under test is pure filesystem manipulation, not DB access. The one test that
does exercise the real ensure_org_theme_clone()/sync_directory() path
(test_converges_after_ensure_org_theme_clone_wipe) still doesn't need a DB,
since that path is unrelated to language-code lookup.
"""

import os

import pytest

from deepsel.apps.cms.utils import theme_component_switchers as switchers
from deepsel.apps.cms.utils.theme_overlay import (
    base_theme_dir,
    ensure_org_theme_clone,
    org_theme_dir,
)


@pytest.fixture(autouse=True)
def stub_language_codes(monkeypatch):
    """Every test in this file gets a fixed {en, de, fr} locale set instead of
    hitting the real `locale` table."""
    monkeypatch.setattr(
        switchers, "get_valid_language_codes", lambda: {"en", "de", "fr"}
    )


def _write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def test_creates_switcher_for_component_with_variant(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(
        os.path.join(theme_root, "components/Menu.tsx"),
        "export default function Menu() { return <div>Kontakt (DE)</div>; }\n",
    )
    _write(
        os.path.join(theme_root, "components/Footer.astro"),
        "<footer>DE footer</footer>\n",
    )
    _write(
        os.path.join(theme_root, "en/components/Menu.tsx"),
        "export default function Menu() { return <div>Contact (EN)</div>; }\n",
    )

    switchers.generate_component_switchers(theme_root)

    base_path = os.path.join(theme_root, "components/Menu.base.tsx")
    assert os.path.isfile(base_path)
    assert (
        _read(base_path)
        == "export default function Menu() { return <div>Kontakt (DE)</div>; }\n"
    )

    switcher = _read(os.path.join(theme_root, "components/Menu.tsx"))
    assert switchers.SWITCHER_MARKER_TEXT in switcher
    assert "useLanguage" in switcher
    assert "import VariantBase from './Menu.base';" in switcher
    assert "import VariantEn from '../en/components/Menu';" in switcher
    assert "case 'en':" in switcher

    # A component with no language variant at all must be left completely
    # untouched -- no rename, no switcher, no .base sibling.
    footer_path = os.path.join(theme_root, "components/Footer.astro")
    assert _read(footer_path) == "<footer>DE footer</footer>\n"
    assert not os.path.isfile(os.path.join(theme_root, "components/Footer.base.astro"))


def test_idempotent_rerun_is_a_noop(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/Menu.tsx"), "DE content\n")
    _write(os.path.join(theme_root, "en/components/Menu.tsx"), "EN content\n")

    switchers.generate_component_switchers(theme_root)
    before = _read(os.path.join(theme_root, "components/Menu.tsx"))

    switchers.generate_component_switchers(theme_root)
    after = _read(os.path.join(theme_root, "components/Menu.tsx"))

    assert before == after
    assert os.path.isfile(os.path.join(theme_root, "components/Menu.base.tsx"))


def test_nested_component_gets_independent_switcher(tmp_path):
    """Menu.tsx importing LangSwitcher.tsx, where LangSwitcher.tsx itself has
    its own variant, must get its own switcher independently of Menu.tsx's."""
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/Menu.tsx"), "DE Menu\n")
    _write(os.path.join(theme_root, "en/components/Menu.tsx"), "EN Menu\n")
    _write(os.path.join(theme_root, "components/LangSwitcher.tsx"), "DE LangSwitcher\n")
    _write(
        os.path.join(theme_root, "en/components/LangSwitcher.tsx"), "EN LangSwitcher\n"
    )

    switchers.generate_component_switchers(theme_root)

    assert os.path.isfile(os.path.join(theme_root, "components/Menu.base.tsx"))
    assert os.path.isfile(os.path.join(theme_root, "components/LangSwitcher.base.tsx"))
    ls_switcher = _read(os.path.join(theme_root, "components/LangSwitcher.tsx"))
    assert "VariantEn" in ls_switcher


def test_restores_original_when_last_variant_removed(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    original = "export default function Menu() { return <div>Kontakt (DE)</div>; }\n"
    _write(os.path.join(theme_root, "components/Menu.tsx"), original)
    _write(os.path.join(theme_root, "en/components/Menu.tsx"), "EN content\n")
    switchers.generate_component_switchers(theme_root)
    assert os.path.isfile(os.path.join(theme_root, "components/Menu.base.tsx"))

    os.remove(os.path.join(theme_root, "en/components/Menu.tsx"))
    switchers.generate_component_switchers(theme_root)

    assert not os.path.isfile(os.path.join(theme_root, "components/Menu.base.tsx"))
    assert _read(os.path.join(theme_root, "components/Menu.tsx")) == original


def test_multiple_simultaneous_variants(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/PageIsland.tsx"), "DE\n")
    _write(os.path.join(theme_root, "en/components/PageIsland.tsx"), "EN\n")
    _write(os.path.join(theme_root, "fr/components/PageIsland.tsx"), "FR\n")

    switchers.generate_component_switchers(theme_root)

    switcher = _read(os.path.join(theme_root, "components/PageIsland.tsx"))
    assert "case 'en':" in switcher and "case 'fr':" in switcher
    assert switcher.count("import VariantEn") == 1
    assert switcher.count("import VariantFr") == 1
    assert "from '../en/components/PageIsland'" in switcher
    assert "from '../fr/components/PageIsland'" in switcher


def test_partial_variant_removal_regenerates_switcher_keeps_base(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/PageIsland.tsx"), "DE\n")
    _write(os.path.join(theme_root, "en/components/PageIsland.tsx"), "EN\n")
    _write(os.path.join(theme_root, "fr/components/PageIsland.tsx"), "FR\n")
    switchers.generate_component_switchers(theme_root)

    os.remove(os.path.join(theme_root, "fr/components/PageIsland.tsx"))
    switchers.generate_component_switchers(theme_root)

    switcher = _read(os.path.join(theme_root, "components/PageIsland.tsx"))
    assert "case 'en':" in switcher
    assert "case 'fr':" not in switcher
    # At least one variant remains, so the base sibling must survive.
    assert os.path.isfile(os.path.join(theme_root, "components/PageIsland.base.tsx"))


def test_astro_switcher_uses_parse_slug_and_keeps_extension(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/Footer.astro"), "<footer>DE</footer>\n")
    _write(
        os.path.join(theme_root, "en/components/Footer.astro"), "<footer>EN</footer>\n"
    )
    _write(
        os.path.join(theme_root, "fr/components/Footer.astro"), "<footer>FR</footer>\n"
    )

    switchers.generate_component_switchers(theme_root)

    base_path = os.path.join(theme_root, "components/Footer.base.astro")
    assert os.path.isfile(base_path)
    assert _read(base_path) == "<footer>DE</footer>\n"

    switcher = _read(os.path.join(theme_root, "components/Footer.astro"))
    assert switchers.SWITCHER_MARKER_TEXT in switcher
    assert "parseSlug" in switcher and "@deepsel/cms-utils" in switcher
    # .astro imports keep the extension, unlike .tsx.
    assert "from './Footer.base.astro'" in switcher
    assert "from '../en/components/Footer.astro'" in switcher
    assert "from '../fr/components/Footer.astro'" in switcher
    assert "lang === 'en'" in switcher and "lang === 'fr'" in switcher
    assert "{...Astro.props}" in switcher


def test_page_level_template_at_theme_root_is_never_switched(tmp_path):
    """Page-level templates (Index.astro, page.astro, kontakt.astro, ...) sit
    directly at theme_root and are already language-resolved via `themeMap`
    (theme_imports.py) -- that same directory is also non-recursively scanned
    by generate_theme_imports() to build client/src/themes.ts. Installing a
    switcher here would rename the original to page.base.astro, a stray
    sibling that generate_theme_imports() cannot distinguish from a real page
    template, producing a broken (unsanitized, dotted) JS identifier and a
    build-breaking themes.ts -- confirmed against a real running environment.
    A page template must be left completely alone, even with a variant."""
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "page.astro"), "<div>DE page</div>\n")
    _write(os.path.join(theme_root, "de/page.astro"), "<div>DE page</div>\n")

    switchers.generate_component_switchers(theme_root)

    assert _read(os.path.join(theme_root, "page.astro")) == "<div>DE page</div>\n"
    assert not os.path.isfile(os.path.join(theme_root, "page.base.astro"))


def test_astro_idempotent_rerun(tmp_path):
    theme_root = str(tmp_path / "alcoris")
    _write(os.path.join(theme_root, "components/Footer.astro"), "<footer>DE</footer>\n")
    _write(
        os.path.join(theme_root, "en/components/Footer.astro"), "<footer>EN</footer>\n"
    )

    switchers.generate_component_switchers(theme_root)
    before = _read(os.path.join(theme_root, "components/Footer.astro"))
    switchers.generate_component_switchers(theme_root)
    after = _read(os.path.join(theme_root, "components/Footer.astro"))

    assert before == after


def test_converges_after_ensure_org_theme_clone_wipe(tmp_path):
    """ensure_org_theme_clone() mirrors base -> org overlay with delete
    semantics (sync_directory), so re-running it wipes a previously-installed
    switcher/.base sibling back to plain base content before
    generate_component_switchers() runs again in the same reconcile pass (see
    reconcile_theme_overlays()/validate_theme_build() in setup_themes.py,
    both call ensure_org_theme_clone() then, later, this function). This test
    proves that sequence still converges to the identical, correct switcher
    every time, using the real ensure_org_theme_clone()/sync_directory (not
    mocked)."""
    data_dir = str(tmp_path)
    theme_name = "alcoris"
    org_id = 1

    base_dir = base_theme_dir(data_dir, theme_name)
    _write(os.path.join(base_dir, "components/Menu.tsx"), "DE base\n")

    ensure_org_theme_clone(data_dir, org_id, theme_name)
    overlay_dir = org_theme_dir(data_dir, org_id, theme_name)
    _write(os.path.join(overlay_dir, "en/components/Menu.tsx"), "EN variant\n")
    switchers.generate_component_switchers(overlay_dir)

    first_switcher = _read(os.path.join(overlay_dir, "components/Menu.tsx"))
    assert switchers.SWITCHER_MARKER_TEXT in first_switcher

    # Simulate a second, unrelated reconcile pass: re-clone base -> overlay.
    ensure_org_theme_clone(data_dir, org_id, theme_name)
    # Confirm the wipe actually happened -- this is the concerning
    # intermediate state the fix relies on self-healing from.
    wiped = _read(os.path.join(overlay_dir, "components/Menu.tsx"))
    assert switchers.SWITCHER_MARKER_TEXT not in wiped
    assert not os.path.isfile(os.path.join(overlay_dir, "components/Menu.base.tsx"))

    # The DB-tracked variant row would be rewritten here in a real reconcile;
    # reproduce that write, then regenerate switchers as the real code does.
    _write(os.path.join(overlay_dir, "en/components/Menu.tsx"), "EN variant\n")
    switchers.generate_component_switchers(overlay_dir)

    second_switcher = _read(os.path.join(overlay_dir, "components/Menu.tsx"))
    assert second_switcher == first_switcher
    assert _read(os.path.join(overlay_dir, "components/Menu.base.tsx")) == "DE base\n"
