"""Tests for CRUDRouter (deepsel/utils/crud_router.py) via FastAPI TestClient.

These tests construct a real FastAPI app with a CRUDRouter mounted on a
``ThingModel`` table, backed by the Postgres testcontainer. Permission
enforcement lives in the ORMBaseMixin model methods (which raise
HTTPException 403), so success-vs-403 is driven by varying the current
user's permissions.
"""

import types

import pytest

# IMPORTANT import-order quirk: import deepsel.utils.* BEFORE deepsel.orm.mixin
# to avoid a circular import during isolated collection.
from deepsel.utils.models_pool import models_pool
from deepsel.utils.generate_crud_schemas import (
    generate_read_schema,
    generate_search_schema,
)

from deepsel.orm.mixin import ORMBaseMixin

from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

import deepsel.deps as deps
from deepsel.utils.crud_router import CRUDRouter

from fastapi import FastAPI
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Test model
# ---------------------------------------------------------------------------

Base = declarative_base()


class ThingModel(Base, ORMBaseMixin):
    __tablename__ = "thing"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)


# ---------------------------------------------------------------------------
# Mock user (mirrors MockUser in test_mixin.py)
# ---------------------------------------------------------------------------


class MockUser:
    def __init__(
        self,
        id=1,
        current_organization_id=1,
        permissions=None,
        org_ids=None,
    ):
        self.id = id
        self.current_organization_id = current_organization_id
        self._permissions = permissions or []
        self._org_ids = org_ids or (
            [current_organization_id] if current_organization_id else []
        )

    def get_user_permissions(self):
        return self._permissions

    def get_org_ids(self):
        return self._org_ids


def _admin_user():
    return MockUser(id=1, current_organization_id=1, permissions=["thing:*:*"])


def _readonly_user():
    return MockUser(id=2, current_organization_id=1, permissions=["thing:read:*"])


def _nobody_user():
    return MockUser(id=3, current_organization_id=1, permissions=[])


# Mutable holder for the current user; each test sets CURRENT_USER["user"].
CURRENT_USER = {"user": None}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    models_pool["thing"] = ThingModel
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture(scope="module")
def SessionLocal(engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="module")
def app(engine, SessionLocal):
    def get_db_func():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def get_current_user_func():
        return CURRENT_USER["user"]

    # configure_deps mutates module-level globals on deepsel.deps (Base, get_db,
    # get_current_user, settings, ...). Snapshot them so we can restore on
    # teardown — otherwise other test modules (e.g. deepsel/apps/cms) whose
    # fixtures rely on deps.Base.metadata.create_all() would build the schema
    # from THIS module's Base (only "thing"), breaking with "relation does not
    # exist".
    deps_snapshot = {
        attr: getattr(deps, attr)
        for attr in (
            "Base",
            "get_db",
            "get_current_user",
            "get_current_user_optional",
            "get_db_context",
            "settings",
        )
    }

    deps.configure_deps(
        base=Base,
        get_db_func=get_db_func,
        get_current_user_func=get_current_user_func,
        get_current_user_optional_func=get_current_user_func,
        get_db_context_func=get_db_func,
        settings_obj=types.SimpleNamespace(API_PREFIX=""),
    )

    read_schema = generate_read_schema(ThingModel)
    search_schema = generate_search_schema(ThingModel, read_schema)

    router = CRUDRouter(
        table_name="thing",
        read_schema=read_schema,
        search_schema=search_schema,
        get_all_route=True,
    )

    application = FastAPI()
    application.include_router(router)
    yield application

    for attr, value in deps_snapshot.items():
        setattr(deps, attr, value)


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_table(request):
    """Truncate the thing table before each test that uses the DB and reset
    the current user to admin by default."""
    CURRENT_USER["user"] = _admin_user()
    if "SessionLocal" in request.fixturenames:
        SessionLocal = request.getfixturevalue("SessionLocal")
        db = SessionLocal()
        try:
            db.query(ThingModel).delete()
            db.commit()
        finally:
            db.close()
    yield


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------


def _route_set(router):
    """Return set of (path_without_prefix, frozenset(methods)) for the router."""
    result = set()
    prefix = router.prefix
    for r in router.routes:
        path = r.path
        if prefix and path.startswith(prefix):
            path = path[len(prefix) :]
        result.add((path, frozenset(r.methods)))
    return result


def _build_router(**kwargs):
    read_schema = generate_read_schema(ThingModel)
    return CRUDRouter(table_name="thing", read_schema=read_schema, **kwargs)


class TestRouteRegistration:
    def test_default_routes_present(self, app):
        router = _build_router(get_all_route=True)
        routes = _route_set(router)
        assert ("/search", frozenset({"POST"})) in routes
        assert ("/bulk_delete", frozenset({"POST"})) in routes
        assert ("/export", frozenset({"POST"})) in routes
        assert ("/import", frozenset({"POST"})) in routes
        assert ("", frozenset({"POST"})) in routes  # create
        assert ("/{item_id}", frozenset({"GET"})) in routes
        assert ("/{item_id}", frozenset({"PUT"})) in routes
        assert ("/{item_id}", frozenset({"DELETE"})) in routes

    def test_get_all_absent_by_default(self, app):
        router = _build_router()  # get_all_route defaults False
        routes = _route_set(router)
        assert ("", frozenset({"GET"})) not in routes

    def test_get_all_present_when_enabled(self, app):
        router = _build_router(get_all_route=True)
        routes = _route_set(router)
        assert ("", frozenset({"GET"})) in routes

    def test_disable_create_route(self, app):
        router = _build_router(create_route=False)
        routes = _route_set(router)
        assert ("", frozenset({"POST"})) not in routes


# ---------------------------------------------------------------------------
# CRUD behavior
# ---------------------------------------------------------------------------


class TestCRUD:
    def test_create(self, client, SessionLocal):
        CURRENT_USER["user"] = _admin_user()
        resp = client.post("/thing", json={"name": "Widget"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Widget"
        assert "id" in body

        db = SessionLocal()
        try:
            row = db.query(ThingModel).filter_by(id=body["id"]).first()
            assert row is not None
            assert row.name == "Widget"
        finally:
            db.close()

    def test_get_one_found(self, client):
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "Gadget"}).json()
        resp = client.get(f"/thing/{created['id']}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "Gadget"

    def test_get_one_missing(self, client):
        # NOTE: ORMBaseMixin.get_one raises 403 (not 404) when the record is
        # absent or out of scope — it does not distinguish "missing" from
        # "forbidden". So the router's 404 branch for get_one is unreachable.
        CURRENT_USER["user"] = _admin_user()
        resp = client.get("/thing/999999")
        assert resp.status_code == 403

    def test_update(self, client):
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "Old"}).json()
        resp = client.put(f"/thing/{created['id']}", json={"name": "New"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["name"] == "New"
        # confirm via get one
        got = client.get(f"/thing/{created['id']}")
        assert got.json()["name"] == "New"

    def test_delete(self, client):
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "Doomed"}).json()
        resp = client.delete(f"/thing/{created['id']}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["success"] is True
        # now gone — get_one raises 403 for an absent record (see test_get_one_missing)
        assert client.get(f"/thing/{created['id']}").status_code == 403

    def test_delete_missing_404(self, client):
        CURRENT_USER["user"] = _admin_user()
        resp = client.delete("/thing/999999")
        assert resp.status_code == 404

    def test_search(self, client):
        CURRENT_USER["user"] = _admin_user()
        client.post("/thing", json={"name": "apple"})
        client.post("/thing", json={"name": "banana"})
        client.post("/thing", json={"name": "apple"})

        resp = client.post(
            "/thing/search",
            json={
                "search": {
                    "AND": [{"field": "name", "operator": "=", "value": "apple"}]
                }
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        assert len(body["data"]) == 2
        assert all(d["name"] == "apple" for d in body["data"])

    def test_pagination_get_all(self, client):
        CURRENT_USER["user"] = _admin_user()
        for i in range(5):
            client.post("/thing", json={"name": f"item-{i}"})

        resp = client.get("/thing", params={"skip": 0, "limit": 2})
        assert resp.status_code == 200, resp.text
        assert len(resp.json()) == 2

        resp2 = client.get("/thing", params={"skip": 0, "limit": 10})
        assert len(resp2.json()) == 5


# ---------------------------------------------------------------------------
# Permission enforcement (403)
# ---------------------------------------------------------------------------


class TestPermissions:
    def test_create_forbidden(self, client):
        CURRENT_USER["user"] = _readonly_user()  # has read, not create
        resp = client.post("/thing", json={"name": "nope"})
        assert resp.status_code == 403

    def test_create_allowed_with_wildcard(self, client):
        CURRENT_USER["user"] = _admin_user()
        resp = client.post("/thing", json={"name": "yes"})
        assert resp.status_code == 200, resp.text

    def test_get_one_forbidden(self, client):
        # create as admin first
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "secret"}).json()
        # switch to a user with no permissions
        CURRENT_USER["user"] = _nobody_user()
        resp = client.get(f"/thing/{created['id']}")
        assert resp.status_code == 403

    def test_update_forbidden(self, client):
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "x"}).json()
        CURRENT_USER["user"] = _readonly_user()  # read only, cannot write
        resp = client.put(f"/thing/{created['id']}", json={"name": "y"})
        assert resp.status_code == 403

    def test_delete_forbidden(self, client):
        CURRENT_USER["user"] = _admin_user()
        created = client.post("/thing", json={"name": "z"}).json()
        CURRENT_USER["user"] = _readonly_user()  # read only, cannot delete
        resp = client.delete(f"/thing/{created['id']}")
        assert resp.status_code == 403

    def test_search_forbidden(self, client):
        CURRENT_USER["user"] = _nobody_user()
        resp = client.post("/thing/search", json={})
        assert resp.status_code == 403
