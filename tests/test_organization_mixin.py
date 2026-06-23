"""Tests for deepsel.orm.organization_mixin.OrganizationMixin.

Covers protected-API-key preservation on update, public-settings filtering,
admin-vs-non-admin get_one, and the NotImplementedError contract of the
abstract _get_* hooks. No external services are involved — pure DB logic
against the testcontainer Postgres.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import Boolean, Column, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base

# Import models_pool first: it fully initializes deepsel.utils before
# deepsel.orm.mixin, avoiding a package-level circular import when this module
# is collected in isolation.
from deepsel.utils.models_pool import models_pool
from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.organization_mixin import OrganizationMixin

# ---------------------------------------------------------------------------
# Test config / models
# ---------------------------------------------------------------------------

DEFAULT_ORG_ID = 1
PUBLIC_FIELDS = ["name", "brand_color"]
PROTECTED_FIELDS = ["api_key", "webhook_secret"]
ADMIN_ROLE_IDS = ["admin_role", "super_admin_role"]

Base = declarative_base()


class OrgModel(Base, OrganizationMixin, ORMBaseMixin):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    brand_color = Column(String(20), nullable=True)
    enable_auth = Column(Boolean, default=True)
    api_key = Column(String, nullable=True)
    webhook_secret = Column(String, nullable=True)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)

    @classmethod
    def _get_default_org_id(cls) -> int:
        return DEFAULT_ORG_ID

    @classmethod
    def _get_is_authless(cls) -> bool:
        return True

    @classmethod
    def _get_public_settings_fields(cls) -> list[str]:
        return PUBLIC_FIELDS

    @classmethod
    def _get_protected_api_key_fields(cls) -> list[str]:
        return PROTECTED_FIELDS

    @classmethod
    def _get_admin_role_string_ids(cls) -> list[str]:
        return ADMIN_ROLE_IDS


# A second model that leaves every abstract hook unimplemented, to assert the
# NotImplementedError contract without colliding with OrgModel's table.
class BareOrgModel(OrganizationMixin):
    pass


# ---------------------------------------------------------------------------
# Mock user
# ---------------------------------------------------------------------------


class MockRole:
    def __init__(self, string_id):
        self.string_id = string_id


class MockUser:
    def __init__(self, id=1, org_id=DEFAULT_ORG_ID, permissions=None, roles=None):
        self.id = id
        self.current_organization_id = org_id
        self._permissions = (
            permissions if permissions is not None else ["organization:*:*"]
        )
        self._roles = roles or []

    def get_user_permissions(self):
        return self._permissions

    def get_org_ids(self):
        return [self.current_organization_id]

    def get_user_roles(self):
        return self._roles


def _admin_user():
    return MockUser(roles=[MockRole("admin_role")])


def _plain_user():
    return MockUser(roles=[MockRole("user_role")])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    old_pool = dict(models_pool)
    models_pool["organization"] = OrgModel

    yield session

    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


def _make_org(db, org_id=DEFAULT_ORG_ID, **kwargs):
    defaults = dict(
        name=f"Org{org_id}",
        brand_color="#000000",
        enable_auth=True,
        api_key="secret-api-key",
        webhook_secret="secret-webhook",
    )
    defaults.update(kwargs)
    org = OrgModel(id=org_id, **defaults)
    db.add(org)
    db.flush()
    return org


# ===========================================================================
# update() — protected API key preservation
# ===========================================================================


class TestUpdateProtectedFields:
    def test_omitted_protected_fields_are_preserved(self, db):
        org = _make_org(db)
        org.update(db, _admin_user(), {"name": "Renamed"}, commit=False)

        assert org.name == "Renamed"
        assert org.api_key == "secret-api-key"
        assert org.webhook_secret == "secret-webhook"

    def test_empty_string_protected_field_is_preserved(self, db):
        org = _make_org(db)
        # Falsy values (empty string) must NOT wipe an existing key.
        org.update(db, _admin_user(), {"api_key": ""}, commit=False)
        assert org.api_key == "secret-api-key"

    def test_none_protected_field_is_preserved(self, db):
        org = _make_org(db)
        org.update(db, _admin_user(), {"webhook_secret": None}, commit=False)
        assert org.webhook_secret == "secret-webhook"

    def test_truthy_protected_field_overwrites(self, db):
        org = _make_org(db)
        org.update(db, _admin_user(), {"api_key": "rotated-key"}, commit=False)
        assert org.api_key == "rotated-key"

    def test_non_protected_field_updates_normally(self, db):
        org = _make_org(db)
        org.update(db, _admin_user(), {"brand_color": "#ffffff"}, commit=False)
        assert org.brand_color == "#ffffff"


# ===========================================================================
# get_public_settings()
# ===========================================================================


class TestGetPublicSettings:
    def test_returns_only_public_fields(self, db):
        org = _make_org(db, brand_color="#abcdef")
        result = OrgModel.get_public_settings(org.id, db)

        assert set(result.keys()) == {"name", "brand_color", "authless"}
        assert result["brand_color"] == "#abcdef"
        # Secrets must never leak through public settings.
        assert "api_key" not in result
        assert "webhook_secret" not in result

    def test_missing_org_raises_404(self, db):
        # Default org must exist (it is loaded inside get_public_settings).
        _make_org(db)
        with pytest.raises(HTTPException) as exc:
            OrgModel.get_public_settings(99999, db)
        assert exc.value.status_code == 404

    def test_authless_true_when_auth_disabled(self, db):
        _make_org(db, enable_auth=False)  # default org drives the flag
        result = OrgModel.get_public_settings(DEFAULT_ORG_ID, db)
        # _get_is_authless() is True and default org has auth disabled.
        assert result["authless"] is True

    def test_authless_false_when_auth_enabled(self, db):
        _make_org(db, enable_auth=True)
        result = OrgModel.get_public_settings(DEFAULT_ORG_ID, db)
        assert result["authless"] is False


# ===========================================================================
# get_one() — admin vs non-admin
# ===========================================================================


class TestGetOne:
    def test_admin_gets_full_object(self, db):
        org = _make_org(db)
        result = OrgModel.get_one(db, _admin_user(), org.id)
        # Admin receives the ORM instance, including secrets.
        assert result is org
        assert result.api_key == "secret-api-key"

    def test_non_admin_gets_filtered_public_settings(self, db):
        org = _make_org(db)
        result = OrgModel.get_one(db, _plain_user(), org.id)
        assert isinstance(result, dict)
        assert "api_key" not in result
        assert result["name"] == org.name


# ===========================================================================
# Abstract hook contract
# ===========================================================================


class TestAbstractHooks:
    @pytest.mark.parametrize(
        "method",
        [
            "_get_default_org_id",
            "_get_is_authless",
            "_get_public_settings_fields",
            "_get_protected_api_key_fields",
            "_get_admin_role_string_ids",
        ],
    )
    def test_unimplemented_hook_raises(self, method):
        with pytest.raises(NotImplementedError):
            getattr(BareOrgModel, method)()
