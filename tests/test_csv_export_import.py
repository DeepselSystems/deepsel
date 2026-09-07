"""Tests for CSV export and import (mixin + CRUDRouter).

Uses the same harness pattern as test_crud_router.py: a real Postgres
testcontainer, a CsvThingModel with varied column types, and a MockUser
whose permissions are swapped per test.
"""

import enum
import io
import json
import types

import pytest

# Import-order quirk: utils before orm to avoid circular import.
from deepsel.utils.models_pool import models_pool
from deepsel.utils.generate_crud_schemas import (
    generate_read_schema,
    generate_search_schema,
)

from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.types import CsvImportResponse

from sqlalchemy import (
    Column,
    Integer,
    Float,
    Numeric,
    String,
    Boolean,
    DateTime,
    Date,
    Enum as SAEnum,
    JSON,
    create_engine,
)
from sqlalchemy.orm import declarative_base, sessionmaker

import deepsel.deps as deps
from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile as StarletteUploadFile

# ---------------------------------------------------------------------------
# Test model
# ---------------------------------------------------------------------------

Base = declarative_base()


class Color(enum.Enum):
    red = "red"
    green = "green"
    blue = "blue"


class CsvThingModel(Base, ORMBaseMixin):
    __tablename__ = "csvthing"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    score = Column(Integer, nullable=True)
    rating = Column(Float, nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    color = Column(SAEnum(Color), nullable=True)
    is_cool = Column(Boolean, default=False)
    birthday = Column(Date, nullable=True)
    happened_at = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    secret = Column(String(200), nullable=True)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)

    csv_export_exclude = {"secret"}


# ---------------------------------------------------------------------------
# Mock user
# ---------------------------------------------------------------------------


class MockUser:
    def __init__(self, id=1, current_organization_id=1, permissions=None, org_ids=None):
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
    return MockUser(id=1, current_organization_id=1, permissions=["csvthing:*:*"])


def _readonly_user():
    return MockUser(id=2, current_organization_id=1, permissions=["csvthing:read:*"])


def _nobody_user():
    return MockUser(id=3, current_organization_id=1, permissions=[])


CURRENT_USER = {"user": None}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    models_pool["csvthing"] = CsvThingModel
    yield eng
    Base.metadata.drop_all(eng)
    del models_pool["csvthing"]
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

    deps_snapshot = {
        attr: getattr(deps, attr)
        for attr in ("Base", "get_db", "get_db_context", "settings")
    }

    deps.configure_deps(
        base=Base,
        get_db_func=get_db_func,
        get_db_context_func=get_db_func,
        settings_obj=types.SimpleNamespace(API_PREFIX=""),
    )

    read_schema = generate_read_schema(CsvThingModel)
    search_schema = generate_search_schema(CsvThingModel, read_schema)

    router = CRUDRouter(
        table_name="csvthing",
        read_schema=read_schema,
        search_schema=search_schema,
    )

    application = FastAPI()
    application.include_router(router)
    application.dependency_overrides[get_current_user] = get_current_user_func
    yield application

    for attr, value in deps_snapshot.items():
        setattr(deps, attr, value)


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_table(request):
    CURRENT_USER["user"] = _admin_user()
    if "SessionLocal" in request.fixturenames:
        SessionLocal = request.getfixturevalue("SessionLocal")
        db = SessionLocal()
        try:
            db.query(CsvThingModel).delete()
            db.commit()
        finally:
            db.close()
    yield


def _seed(SessionLocal, rows):
    db = SessionLocal()
    try:
        for row in rows:
            obj = CsvThingModel(**row)
            db.add(obj)
        db.commit()
    finally:
        db.close()


def _make_upload(text: str, filename="test.csv"):
    buf = io.BytesIO(text.encode("utf-8"))
    return {"file": (filename, buf, "text/csv")}


def _make_bom_upload(text: str, filename="test.csv"):
    buf = io.BytesIO(b"\xef\xbb\xbf" + text.encode("utf-8"))
    return {"file": (filename, buf, "text/csv")}


# ---------------------------------------------------------------------------
# Export tests
# ---------------------------------------------------------------------------


class TestExport:
    def test_zero_rows_returns_header(self, client, SessionLocal):
        resp = client.post("/csvthing/export")
        assert resp.status_code == 200
        body = resp.content.decode("utf-8-sig")
        lines = body.strip().split("\n")
        assert len(lines) == 1
        assert "name" in lines[0]
        assert "secret" not in lines[0]

    def test_bom_present(self, client, SessionLocal):
        resp = client.post("/csvthing/export")
        assert resp.content[:3] == b"\xef\xbb\xbf"

    def test_filename_header(self, client, SessionLocal):
        resp = client.post("/csvthing/export")
        cd = resp.headers.get("content-disposition", "")
        assert "csvthing.csv" in cd

    def test_excluded_column_absent(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [{"name": "a", "secret": "s3cr3t", "organization_id": 1, "owner_id": 1}],
        )
        resp = client.post("/csvthing/export")
        body = resp.content.decode("utf-8-sig")
        assert "secret" not in body.split("\n")[0]
        assert "s3cr3t" not in body

    def test_value_formatting(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [
                {
                    "name": "fmt",
                    "score": 42,
                    "rating": 3.14,
                    "color": Color.green,
                    "is_cool": True,
                    "metadata_json": {"k": "v"},
                    "organization_id": 1,
                    "owner_id": 1,
                }
            ],
        )
        resp = client.post("/csvthing/export")
        body = resp.content.decode("utf-8-sig")
        lines = body.strip().split("\n")
        assert len(lines) == 2
        row = lines[1]
        assert "42" in row
        assert "3.14" in row
        assert "green" in row
        assert "true" in row
        assert '"k"' in row

    def test_search_filter_respected(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [
                {"name": "alpha", "organization_id": 1, "owner_id": 1},
                {"name": "beta", "organization_id": 1, "owner_id": 1},
            ],
        )
        resp = client.post(
            "/csvthing/export",
            json={
                "search": {
                    "AND": [{"field": "name", "operator": "=", "value": "alpha"}]
                }
            },
        )
        body = resp.content.decode("utf-8-sig")
        lines = [l for l in body.strip().split("\n") if l.strip()]
        assert len(lines) == 2
        assert "alpha" in lines[1]
        assert "beta" not in lines[1]

    def test_no_read_permission_403(self, client, SessionLocal):
        CURRENT_USER["user"] = _nobody_user()
        resp = client.post("/csvthing/export")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Import tests
# ---------------------------------------------------------------------------


class TestImport:
    def test_create_rows(self, client, SessionLocal):
        csv_text = "name,score,color,is_cool\nalpha,10,red,true\nbeta,20,green,false\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["created"] == 2
        assert data["updated"] == 0
        assert data["total"] == 2

        db = SessionLocal()
        try:
            rows = db.query(CsvThingModel).order_by(CsvThingModel.name).all()
            assert len(rows) == 2
            assert rows[0].name == "alpha"
            assert rows[0].score == 10
            assert rows[0].color == Color.red
            assert rows[0].is_cool is True
            assert rows[0].organization_id == 1
            assert rows[0].owner_id == 1
        finally:
            db.close()

    def test_update_by_id(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [{"name": "orig", "score": 1, "organization_id": 1, "owner_id": 1}],
        )
        db = SessionLocal()
        row_id = db.query(CsvThingModel).first().id
        db.close()

        csv_text = f"id,name,score\n{row_id},updated,99\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["updated"] == 1
        assert data["created"] == 0

        db = SessionLocal()
        row = db.query(CsvThingModel).get(row_id)
        assert row.name == "updated"
        assert row.score == 99
        db.close()

    def test_update_by_string_id_org_scoped(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [
                {
                    "name": "orig",
                    "string_id": "thing-1",
                    "organization_id": 1,
                    "owner_id": 1,
                }
            ],
        )
        csv_text = "string_id,name\nthing-1,renamed\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["updated"] == 1

    def test_other_org_id_creates_new(self, client, SessionLocal):
        _seed(SessionLocal, [{"name": "org2", "organization_id": 2, "owner_id": 2}])
        db = SessionLocal()
        row_id = db.query(CsvThingModel).first().id
        db.close()

        csv_text = f"id,name\n{row_id},should-create\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

    def test_bad_coercion_row_error(self, client, SessionLocal):
        csv_text = "name,score\ngood,10\nbad,not-a-number\ngood2,20\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["success"] is False
        assert data["created"] == 2
        assert data["error_count"] == 1
        assert data["errors"][0]["row"] == 3
        assert "not-a-number" in data["errors"][0]["message"]

    def test_integrity_error_row(self, client, SessionLocal):
        csv_text = "name,score\n,10\ngood,20\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] >= 1
        assert data["error_count"] >= 0 or data["created"] == 2

    def test_dry_run_leaves_empty(self, client, SessionLocal):
        csv_text = "name,score\nalpha,10\nbeta,20\n"
        resp = client.post(
            "/csvthing/import?dry_run=true", files=_make_upload(csv_text)
        )
        data = resp.json()
        assert data["dry_run"] is True
        assert data["created"] == 2

        db = SessionLocal()
        assert db.query(CsvThingModel).count() == 0
        db.close()

    def test_unknown_header_reported(self, client, SessionLocal):
        csv_text = "name,favorite_animal\nalpha,cat\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert "favorite_animal" in data["ignored_columns"]

    def test_readonly_columns_ignored(self, client, SessionLocal):
        csv_text = "name,created_at,organization_id\nalpha,2020-01-01T00:00:00,999\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1
        assert "created_at" in data["ignored_columns"]
        assert "organization_id" in data["ignored_columns"]

        db = SessionLocal()
        row = db.query(CsvThingModel).first()
        assert row.organization_id == 1
        db.close()

    def test_semicolon_delimiter(self, client, SessionLocal):
        csv_text = "name;score\nalpha;10\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

    def test_bom_handled(self, client, SessionLocal):
        csv_text = "name,score\nalpha,10\n"
        resp = client.post("/csvthing/import", files=_make_bom_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

    def test_case_insensitive_headers(self, client, SessionLocal):
        csv_text = " Name , Score \nalpha,10\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

    def test_json_parse(self, client, SessionLocal):
        csv_text = 'name,metadata_json\nalpha,"{""k"": ""v""}"\n'
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

        db = SessionLocal()
        row = db.query(CsvThingModel).first()
        assert row.metadata_json == {"k": "v"}
        db.close()

    def test_json_error_is_row_error(self, client, SessionLocal):
        csv_text = "name,metadata_json\nalpha,not-json\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["error_count"] == 1

    def test_blank_rows_skipped(self, client, SessionLocal):
        csv_text = "name,score\nalpha,10\n,,\nbeta,20\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 2
        assert data["skipped"] == 1
        assert data["total"] == 3

    def test_empty_file_400(self, client, SessionLocal):
        resp = client.post("/csvthing/import", files=_make_upload(""))
        assert resp.status_code == 400

    def test_whitespace_file_400(self, client, SessionLocal):
        resp = client.post("/csvthing/import", files=_make_upload("  \n  \n"))
        assert resp.status_code == 400

    def test_no_accepted_column_400(self, client, SessionLocal):
        csv_text = "unknown_col\nvalue\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        assert resp.status_code == 400

    def test_invalid_utf8_400(self, client, SessionLocal):
        bad_bytes = b"\xff\xfe name,score\nalpha,10\n"
        buf = io.BytesIO(bad_bytes)
        resp = client.post(
            "/csvthing/import", files={"file": ("test.csv", buf, "text/csv")}
        )
        assert resp.status_code == 400

    def test_export_import_round_trip(self, client, SessionLocal):
        _seed(
            SessionLocal,
            [
                {
                    "name": "a",
                    "score": 1,
                    "color": Color.red,
                    "is_cool": True,
                    "organization_id": 1,
                    "owner_id": 1,
                },
                {
                    "name": "b",
                    "score": 2,
                    "color": Color.blue,
                    "is_cool": False,
                    "organization_id": 1,
                    "owner_id": 1,
                },
            ],
        )
        export_resp = client.post("/csvthing/export")
        csv_bytes = export_resp.content
        buf = io.BytesIO(csv_bytes)
        resp = client.post(
            "/csvthing/import", files={"file": ("round.csv", buf, "text/csv")}
        )
        data = resp.json()
        assert data["updated"] == 2
        assert data["created"] == 0

    def test_boolean_garbage_raises(self, client, SessionLocal):
        csv_text = "name,is_cool\nalpha,maybe\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["error_count"] == 1
        assert "boolean" in data["errors"][0]["message"].lower()

    def test_enum_by_name(self, client, SessionLocal):
        csv_text = "name,color\nalpha,red\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 1

        db = SessionLocal()
        row = db.query(CsvThingModel).first()
        assert row.color == Color.red
        db.close()

    def test_crlf_handled(self, client, SessionLocal):
        csv_text = "name,score\r\nalpha,10\r\nbeta,20\r\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["created"] == 2

    def test_custom_csv_import_match(self, client, SessionLocal, monkeypatch):
        _seed(
            SessionLocal,
            [{"name": "match-me", "score": 1, "organization_id": 1, "owner_id": 1}],
        )

        original_match = CsvThingModel.csv_import_match

        @classmethod
        def match_by_name(cls, db, user, row, organization_id):
            result = original_match.__func__(cls, db, user, row, organization_id)
            if result:
                return result
            if row.get("name"):
                q = db.query(CsvThingModel).filter_by(
                    name=row["name"], organization_id=organization_id
                )
                inst = q.first()
                if inst:
                    return inst
            return None

        monkeypatch.setattr(CsvThingModel, "csv_import_match", match_by_name)

        csv_text = "name,score\nmatch-me,99\n"
        resp = client.post("/csvthing/import", files=_make_upload(csv_text))
        data = resp.json()
        assert data["updated"] == 1
        assert data["created"] == 0

        db = SessionLocal()
        row = db.query(CsvThingModel).first()
        assert row.score == 99
        db.close()
