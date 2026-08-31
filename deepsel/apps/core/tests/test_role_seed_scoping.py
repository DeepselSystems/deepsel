"""SB-22 — `admin_role` must not be seeded into tenant organizations.

`admin_role` carries `*` scope: it reads and writes across every organization in
the deployment. Core's seed CSV used to install a copy into each org (the
all-orgs seed loop) and `install_seed_data_for_org` gave every self-serve tenant
its own copy at signup, so any owner could grant cross-org access. It belongs to
the platform organization only.
"""

from deepsel.utils.models_pool import models_pool

RoleModel = models_pool["role"]

PLATFORM_ORG_ID = 1


def _allowed(string_id, organization_id):
    return RoleModel._is_seed_row_allowed_for_org(
        {"string_id": string_id}, organization_id
    )


def test_platform_only_roles_defaults_to_admin_role():
    assert "admin_role" in RoleModel._get_platform_only_role_string_ids()  # nosec B101


def test_admin_role_is_allowed_in_the_platform_org():
    assert _allowed("admin_role", PLATFORM_ORG_ID) is True  # nosec B101


def test_admin_role_is_refused_for_a_tenant_org():
    assert _allowed("admin_role", 7) is False  # nosec B101


def test_other_roles_reach_every_org():
    for org_id in (PLATFORM_ORG_ID, 7, 99):
        assert _allowed("owner_role", org_id) is True  # nosec B101


def test_settings_can_override_the_platform_only_list(monkeypatch):
    import deepsel.deps as deps

    monkeypatch.setattr(
        deps.settings,
        "PLATFORM_ONLY_ROLE_STRING_IDS",
        ("super_admin_role",),
        raising=False,
    )
    assert _allowed("admin_role", 7) is True  # nosec B101
    assert _allowed("super_admin_role", 7) is False  # nosec B101
