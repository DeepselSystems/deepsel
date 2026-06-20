import csv
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from sqlalchemy import Column, Integer, String, create_engine, text
from sqlalchemy.orm import Session, declarative_base

# Import from deepsel.utils first to avoid a known package-level circular import
# between deepsel.orm and deepsel.utils.crud_router when this test file is run
# in isolation.
from deepsel.utils.install_apps import (
    import_csv_data,
    install_routers,
    install_seed_data,
)
from deepsel.utils.models_pool import (
    _resolve_app_dir,
    models_pool,
    resolve_installed_apps,
)
from deepsel.orm.mixin import ORMBaseMixin
from deepsel.sqlalchemy import DatabaseManager

Base = declarative_base()


class OrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=False)


class GlobalSettingModel(Base, ORMBaseMixin):
    __tablename__ = "globalsetting"
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100))
    value = Column(String(100))


class FileBackedModel(Base, ORMBaseMixin):
    __tablename__ = "filebacked"
    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(String(500), nullable=False)


class UserModel(Base, ORMBaseMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(200))
    first_name = Column(String(100))
    last_name = Column(String(100))


class MembershipModel(Base, ORMBaseMixin):
    """Junction-table shape — composite PK, no surrogate `id`. Mirrors
    production tables like `user_organization` / `user_role` that are
    vulnerable to the seed-loader PK-collision bug when app code (or
    SQLAlchemy M2M `secondary` writes) creates rows without `string_id`."""

    __tablename__ = "membership"
    user_id = Column(Integer, primary_key=True)
    org_id = Column(Integer, primary_key=True)
    role = Column(String(50), nullable=True)


from deepsel.apps.example import register_models

_example_models = register_models(Base)
ExampleItemModel = _example_models["example_item"]

TEST_MODELS = {
    "organization": OrganizationModel,
    "role": RoleModel,
    "globalsetting": GlobalSettingModel,
    "filebacked": FileBackedModel,
    "user": UserModel,
    "membership": MembershipModel,
    "example_item": ExampleItemModel,
}


@pytest.fixture(scope="module")
def engine(pg_container):
    """Build schema via DatabaseManager so tenant tables get the composite
    `(string_id, organization_id)` unique constraint."""
    url = pg_container.get_connection_url()
    DatabaseManager(
        sqlalchemy_declarative_base=Base,
        db_url=url,
        models_pool=TEST_MODELS,
    )
    eng = create_engine(url)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    old_pool = dict(models_pool)
    models_pool.update(TEST_MODELS)
    yield session
    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


def _write_csv(path: Path, rows: list[dict]):
    fieldnames = list(rows[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _seed_orgs(db: Session, count: int) -> list[int]:
    ids = []
    for i in range(count):
        org = OrganizationModel(name=f"org_{i}", string_id=f"org_{i}")
        db.add(org)
        db.flush()
        ids.append(org.id)
    db.commit()
    return ids


class TestImportCsvDataMultiOrg:
    def test_loops_all_orgs_when_organization_id_is_none(self, db, tmp_path):
        org_ids = _seed_orgs(db, count=2)

        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "admin", "name": "Admin"}])

        import_csv_data(str(csv_path), db)

        roles = db.query(RoleModel).filter_by(string_id="admin").all()
        assert sorted(r.organization_id for r in roles) == sorted(org_ids)
        assert {r.name for r in roles} == {"Admin"}

    def test_explicit_organization_id_targets_single_org(self, db, tmp_path):
        org_ids = _seed_orgs(db, count=2)
        target_org = org_ids[1]

        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "viewer", "name": "Viewer"}])

        import_csv_data(str(csv_path), db, organization_id=target_org)

        roles = db.query(RoleModel).filter_by(string_id="viewer").all()
        assert len(roles) == 1
        assert roles[0].organization_id == target_org

    def test_non_tenant_model_inserts_once(self, db, tmp_path):
        _seed_orgs(db, count=3)

        csv_path = tmp_path / "globalsetting.csv"
        _write_csv(
            csv_path,
            [{"string_id": "site_name", "key": "site_name", "value": "Deepsel"}],
        )

        import_csv_data(str(csv_path), db)

        settings = db.query(GlobalSettingModel).filter_by(string_id="site_name").all()
        assert len(settings) == 1
        assert settings[0].value == "Deepsel"

    def test_idempotent_across_runs(self, db, tmp_path):
        org_ids = _seed_orgs(db, count=2)

        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "admin", "name": "Admin"}])

        import_csv_data(str(csv_path), db)
        import_csv_data(str(csv_path), db)

        roles = db.query(RoleModel).filter_by(string_id="admin").all()
        assert len(roles) == len(org_ids)

    def test_skips_when_no_orgs_exist(self, db, tmp_path, caplog):
        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "admin", "name": "Admin"}])

        with caplog.at_level("WARNING"):
            import_csv_data(str(csv_path), db)

        assert db.query(RoleModel).count() == 0
        assert any("No organizations found" in m for m in caplog.messages)

    def test_direct_install_csv_data_raises_without_org(self, db, tmp_path):
        _seed_orgs(db, count=1)

        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "admin", "name": "Admin"}])

        with pytest.raises(ValueError, match="tenant-scoped"):
            RoleModel.install_csv_data(file_name=str(csv_path), db=db)

    def test_csv_with_explicit_organization_id_skips_loop(self, db, tmp_path):
        """When the CSV has an `organization_id` column, the CSV controls
        placement; the multi-org loop must NOT fire (would duplicate rows)."""
        org_ids = _seed_orgs(db, count=3)
        target_org = org_ids[0]

        csv_path = tmp_path / "role.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "pinned",
                    "name": "Pinned",
                    "organization_id": str(target_org),
                }
            ],
        )

        import_csv_data(str(csv_path), db)
        import_csv_data(str(csv_path), db)

        roles = db.query(RoleModel).filter_by(string_id="pinned").all()
        assert len(roles) == 1
        assert roles[0].organization_id == target_org

    def test_csv_with_slash_form_organization_skips_loop(self, db, tmp_path):
        """Same as above but using the `organization/organization_id` slash form
        (string_id reference) — must also bypass the loop."""
        org_ids = _seed_orgs(db, count=2)
        target_org_string_id = "org_1"
        expected_org_id = org_ids[1]

        csv_path = tmp_path / "role.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "pinned_slash",
                    "name": "Pinned Slash",
                    "organization/organization_id": target_org_string_id,
                }
            ],
        )

        import_csv_data(str(csv_path), db)
        import_csv_data(str(csv_path), db)

        roles = db.query(RoleModel).filter_by(string_id="pinned_slash").all()
        assert len(roles) == 1
        assert roles[0].organization_id == expected_org_id


class TestNaturalKeyFallback:
    """Composite-PK / junction-table fix: when string_id lookup misses but a
    row with the same PK already exists, skip the INSERT to avoid a
    UniqueViolation. Mirrors the no-op behavior of the string_id-match
    branch for non-system rows; force-applies for system rows.

    Tests in this class also lock in non-M2M regression — surrogate-id
    models must continue to INSERT normally (fallback guard skips them)."""

    def _write_membership_csv(self, path, rows):
        _write_csv(path, rows)

    # --- composite-PK / junction-table cases (the fix target) -----------

    def test_skip_when_natural_key_match_no_string_id(self, db, tmp_path):
        """Pre-existing junction row (no string_id) + non-system CSV row with
        same PK → skipped, no exception, no duplicate. Reproduces the
        production crash and verifies the fix."""
        db.add(MembershipModel(user_id=1, org_id=1))
        db.flush()

        csv_path = tmp_path / "membership.csv"
        _write_csv(
            csv_path,
            [{"string_id": "admin_default", "user_id": "1", "org_id": "1"}],
        )

        # Must not raise psycopg2.errors.UniqueViolation
        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)

        rows = db.query(MembershipModel).all()
        assert len(rows) == 1
        # Skipped — existing row untouched.
        assert rows[0].string_id in (None, "")

    def test_apply_when_csv_row_is_system(self, db, tmp_path):
        """Pre-existing junction row + CSV row with system=True → CSV cols
        applied (string_id stamped, role overwritten)."""
        db.add(MembershipModel(user_id=2, org_id=1, role="viewer"))
        db.flush()

        csv_path = tmp_path / "membership.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "system_default",
                    "user_id": "2",
                    "org_id": "1",
                    "role": "admin",
                    "system": "True",
                }
            ],
        )

        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)

        rows = db.query(MembershipModel).all()
        assert len(rows) == 1
        assert rows[0].string_id == "system_default"
        assert rows[0].role == "admin"

    def test_apply_when_existing_row_is_system(self, db, tmp_path):
        """Pre-existing system=True row + non-system CSV row with same PK →
        CSV cols applied (natural.system triggers force-apply). Consistent
        with how existing-record branch treats system rows."""
        db.add(MembershipModel(user_id=3, org_id=1, role="old", system=True))
        db.flush()

        csv_path = tmp_path / "membership.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "claimed",
                    "user_id": "3",
                    "org_id": "1",
                    "role": "new",
                }
            ],
        )

        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)

        rows = db.query(MembershipModel).all()
        assert len(rows) == 1
        assert rows[0].string_id == "claimed"
        assert rows[0].role == "new"

    def test_insert_when_no_natural_key_match(self, db, tmp_path):
        """No pre-existing row → normal INSERT. Regression guard for the
        happy path."""
        csv_path = tmp_path / "membership.csv"
        _write_csv(
            csv_path,
            [{"string_id": "fresh", "user_id": "4", "org_id": "1"}],
        )

        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)

        rows = db.query(MembershipModel).all()
        assert len(rows) == 1
        assert rows[0].user_id == 4
        assert rows[0].org_id == 1
        assert rows[0].string_id == "fresh"

    def test_idempotent_repeated_install(self, db, tmp_path):
        """Re-running install_csv_data must not crash and must not duplicate.
        First run skips (natural-key match), second run also skips. The
        production scenario: every pod boot re-runs seed against a DB where
        the row already exists."""
        db.add(MembershipModel(user_id=5, org_id=1))
        db.flush()

        csv_path = tmp_path / "membership.csv"
        _write_csv(
            csv_path,
            [{"string_id": "repeat", "user_id": "5", "org_id": "1"}],
        )

        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)
        MembershipModel.install_csv_data(file_name=str(csv_path), db=db)

        assert db.query(MembershipModel).count() == 1

    # --- non-M2M regression (the user's nervousness, locked down) -------

    def test_surrogate_id_csv_omits_id_inserts_normally(self, db, tmp_path):
        """Surrogate-id model (single PK `id`), CSV omits `id` →
        `pk_kwargs={}`, guard skips fallback, normal auto-id INSERT runs.
        Covers the vast majority of seed CSVs. Must behave identically to
        pre-fix code."""
        _seed_orgs(db, count=1)

        csv_path = tmp_path / "role.csv"
        _write_csv(csv_path, [{"string_id": "viewer", "name": "Viewer"}])

        import_csv_data(str(csv_path), db)

        roles = db.query(RoleModel).filter_by(string_id="viewer").all()
        assert len(roles) == 1
        assert roles[0].id is not None  # auto-generated

    def test_surrogate_id_global_csv_no_id_inserts_normally(self, db, tmp_path):
        """Non-tenant surrogate-id model, CSV omits `id` → normal INSERT
        (no spurious natural-key match against unrelated rows)."""
        csv_path = tmp_path / "globalsetting.csv"
        _write_csv(
            csv_path,
            [{"string_id": "site_name", "key": "site_name", "value": "Deepsel"}],
        )

        import_csv_data(str(csv_path), db)

        settings = db.query(GlobalSettingModel).all()
        assert len(settings) == 1
        assert settings[0].value == "Deepsel"

    def test_surrogate_id_csv_explicit_id_matching_existing_skips(self, db, tmp_path):
        """Rare-but-legal: CSV provides `id` matching an existing row →
        fallback engages, non-system row is skipped (strictly safer than
        pre-fix code, which would blind-INSERT and PK-collide)."""
        existing = GlobalSettingModel(key="theme", value="dark", string_id=None)
        db.add(existing)
        db.flush()
        existing_id = existing.id

        csv_path = tmp_path / "globalsetting.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "theme_seed",
                    "id": str(existing_id),
                    "key": "theme",
                    "value": "light",
                }
            ],
        )

        # Pre-fix: would raise UniqueViolation on the `id` PK.
        GlobalSettingModel.install_csv_data(file_name=str(csv_path), db=db)

        rows = db.query(GlobalSettingModel).all()
        assert len(rows) == 1
        # Non-system skip semantics — row untouched.
        assert rows[0].value == "dark"
        assert rows[0].string_id is None


class TestFileColumnCsvImport:
    def test_file_content_resolves_relative_to_csv_dir(self, db, tmp_path):
        source_path = tmp_path / "content.html"
        source_path.write_text("<p>Hello</p>", encoding="utf-8")
        csv_path = tmp_path / "filebacked.csv"
        _write_csv(
            csv_path,
            [{"string_id": "relative", "file:content": "content.html"}],
        )

        import_csv_data(str(csv_path), db)

        row = db.query(FileBackedModel).filter_by(string_id="relative").one()
        assert row.content == "<p>Hello</p>"

    def test_file_content_resolves_legacy_app_relative_path(self, db, tmp_path):
        app_root = tmp_path / "deepsel" / "apps" / "cms"
        data_dir = app_root / "data"
        templates_dir = app_root / "templates"
        data_dir.mkdir(parents=True)
        templates_dir.mkdir()
        (templates_dir / "forms_notification.html").write_text(
            "<p>Submitted</p>",
            encoding="utf-8",
        )
        csv_path = data_dir / "filebacked.csv"
        _write_csv(
            csv_path,
            [
                {
                    "string_id": "legacy",
                    "file:content": "apps/cms/templates/forms_notification.html",
                }
            ],
        )

        import_csv_data(str(csv_path), db)

        row = db.query(FileBackedModel).filter_by(string_id="legacy").one()
        assert row.content == "<p>Submitted</p>"

    def test_missing_file_content_raises_clear_error(self, db, tmp_path):
        csv_path = tmp_path / "filebacked.csv"
        _write_csv(
            csv_path,
            [{"string_id": "missing", "file:content": "missing.html"}],
        )

        with pytest.raises(FileNotFoundError, match="missing.html"):
            import_csv_data(str(csv_path), db)


# ---------------------------------------------------------------------------
# Package-app seam: discover_apps + app-dir loading
# ---------------------------------------------------------------------------


class TestResolveAppDir:
    def test_filesystem_path(self, tmp_path):
        app_dir = tmp_path / "my_apps"
        app_dir.mkdir()
        fs_path, module_prefix = _resolve_app_dir(str(app_dir))
        assert fs_path == str(app_dir)
        assert module_prefix == str(app_dir).replace("/", ".")

    def test_import_path(self):
        fs_path, module_prefix = _resolve_app_dir("deepsel.apps")
        assert module_prefix == "deepsel.apps"
        assert fs_path.endswith("deepsel/apps")
        assert Path(fs_path).is_dir()

    def test_nonexistent_falls_back(self):
        fs_path, module_prefix = _resolve_app_dir("no.such.package.xyz")
        assert fs_path == "no.such.package.xyz"
        assert module_prefix == "no.such.package.xyz"


class TestResolveInstalledApps:
    def test_resolves_short_names_from_base_dir_and_dotted_defaults(self, tmp_path):
        backend_dir = tmp_path / "backend"
        app_dir = backend_dir / "apps"
        core_dir = app_dir / "core"
        core_dir.mkdir(parents=True)
        (app_dir / "__init__.py").write_text("")
        (core_dir / "__init__.py").write_text("")

        apps = resolve_installed_apps(
            "core, cms",
            "apps, deepsel.apps",
            base_dir=backend_dir,
        )
        prefixes = [module_prefix for _, module_prefix in apps]

        assert prefixes == ["apps.core", "deepsel.apps.cms"]
        assert "deepsel.apps.example" not in prefixes


class TestInstallRoutersFromAppDir:
    def test_registers_router_via_synthetic_package(self, tmp_path, monkeypatch):
        import deepsel.utils.models_pool as mp

        monkeypatch.setattr(mp, "_DEFAULT_APP_DIRS", [])

        root = tmp_path / "fake_apps"
        root.mkdir()
        (root / "__init__.py").write_text("")
        pkg = root / "fake_pkg"
        pkg.mkdir()
        (pkg / "__init__.py").write_text("")
        routers = pkg / "routers"
        routers.mkdir()
        (routers / "__init__.py").write_text("")
        (routers / "ping.py").write_text(
            "from fastapi import APIRouter\n"
            "router = APIRouter()\n"
            "@router.get('/ping')\n"
            "def ping(): return 'pong'\n"
        )
        sys.path.insert(0, str(tmp_path))
        try:
            app = FastAPI()
            install_routers(
                fastapi_app=app,
                app_dirs="fake_apps",
                installed_apps="fake_pkg",
            )
            paths = [r.path for r in app.routes]
            assert "/ping" in paths
        finally:
            sys.path.remove(str(tmp_path))

    def test_registers_only_explicit_installed_app(self, tmp_path, monkeypatch):
        import deepsel.utils.models_pool as mp

        monkeypatch.setattr(mp, "_DEFAULT_APP_DIRS", [])

        root = tmp_path / "explicit_apps"
        root.mkdir()
        (root / "__init__.py").write_text("")
        for package_name, route_path in (
            ("enabled_app", "/enabled"),
            ("disabled_app", "/disabled"),
        ):
            package_dir = root / package_name
            package_dir.mkdir()
            (package_dir / "__init__.py").write_text("")
            routers_dir = package_dir / "routers"
            routers_dir.mkdir()
            (routers_dir / "__init__.py").write_text("")
            (routers_dir / "ping.py").write_text(
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n"
                f"@router.get('{route_path}')\n"
                "def ping(): return 'pong'\n"
            )
        sys.path.insert(0, str(tmp_path))
        try:
            app = FastAPI()
            install_routers(
                fastapi_app=app,
                app_dirs="explicit_apps",
                installed_apps="enabled_app",
            )
            paths = [route.path for route in app.routes]
            assert "/enabled" in paths
            assert "/disabled" not in paths
        finally:
            sys.path.remove(str(tmp_path))


class TestInstallSeedDataFromAppDir:
    def test_loads_csv_via_dotted_path(self, db):
        install_seed_data(
            app_dirs="deepsel.apps",
            db=db,
            installed_apps="example",
        )
        row = db.query(ExampleItemModel).filter_by(string_id="hello_world").first()
        assert row is not None
        assert row.name == "Hello World"
        assert row.description == "A sample item from the deepsel example app"

    def test_idempotent_via_dotted_path(self, db):
        install_seed_data(
            app_dirs="deepsel.apps",
            db=db,
            installed_apps="example",
        )
        install_seed_data(
            app_dirs="deepsel.apps",
            db=db,
            installed_apps="example",
        )
        rows = db.query(ExampleItemModel).filter_by(string_id="hello_world").all()
        assert len(rows) == 1
