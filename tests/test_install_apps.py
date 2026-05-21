import csv
from pathlib import Path

import pytest
from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base

# Import from deepsel.utils first to avoid a known package-level circular import
# between deepsel.orm and deepsel.utils.crud_router when this test file is run
# in isolation.
from deepsel.utils.install_apps import import_csv_data
from deepsel.utils.models_pool import models_pool
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


TEST_MODELS = {
    "organization": OrganizationModel,
    "role": RoleModel,
    "globalsetting": GlobalSettingModel,
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
