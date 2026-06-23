"""Tests for deepsel.auth.saml.SamlService.

Covers relay-state encode/decode, X.509 certificate normalization, SP/IdP
settings construction, request preparation, and the assertion-handling flow
(error propagation, relay-state/org validation, attribute extraction, and
existing-vs-new user resolution). The OneLogin SAML auth layer is mocked —
no real SAML signature validation or network.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship

# models_pool first to avoid the package-level circular import.
from deepsel.utils.models_pool import models_pool
from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.user_mixin import UserMixin
from deepsel.auth.saml import (
    SamlService,
    _encode_relay_state,
    _decode_relay_state,
)

APP_SECRET = "test-secret"
AUTH_ALGORITHM = "HS256"
DEFAULT_ORG_ID = 1
BACKEND_URL = "https://api.test"
FRONTEND_URL = "https://app.test"

CERT_BODY = "MIIBdummybase64body"

Base = declarative_base()

user_organization_table = Table(
    "user_organization",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("user.id"), primary_key=True),
    Column("organization_id", Integer, ForeignKey("organization.id"), primary_key=True),
)

user_role_table = Table(
    "user_role",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("user.id"), primary_key=True),
    Column("role_id", Integer, ForeignKey("role.id"), primary_key=True),
)


class OrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    access_token_expire_minutes = Column(Integer, nullable=True)
    saml_idp_entity_id = Column(String, nullable=True)
    saml_idp_sso_url = Column(String, nullable=True)
    saml_idp_x509_cert = Column(String, nullable=True)
    saml_sp_entity_id = Column(String, nullable=True)
    saml_sp_acs_url = Column(String, nullable=True)
    saml_sp_sls_url = Column(String, nullable=True)
    saml_attribute_mapping = Column(JSON, nullable=True)


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))


class UserModel(Base, ORMBaseMixin, UserMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=True)
    username = Column(String(255), unique=True, nullable=True)
    name = Column(String(255), nullable=True)
    saml_nameid = Column(String, nullable=True)
    signed_up = Column(Boolean, default=False)

    organizations = relationship("OrganizationModel", secondary="user_organization")
    roles = relationship("RoleModel", secondary="user_role")


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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
    session = Session(bind=connection, join_transaction_mode="create_savepoint")

    old_pool = dict(models_pool)
    models_pool["user"] = UserModel
    models_pool["organization"] = OrganizationModel
    models_pool["role"] = RoleModel

    yield session

    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


@pytest.fixture
def service():
    return SamlService(
        app_secret=APP_SECRET,
        auth_algorithm=AUTH_ALGORITHM,
        default_org_id=DEFAULT_ORG_ID,
        backend_url=BACKEND_URL,
        frontend_url=FRONTEND_URL,
    )


def _make_org(db, org_id=DEFAULT_ORG_ID, idp=True, **kwargs):
    fields = dict(name="Org", access_token_expire_minutes=60)
    if idp:
        fields.update(
            saml_idp_entity_id="https://idp/entity",
            saml_idp_sso_url="https://idp/sso",
            saml_idp_x509_cert=CERT_BODY,
        )
    fields.update(kwargs)
    org = OrganizationModel(id=org_id, **fields)
    db.add(org)
    db.flush()
    return org


def _fake_request(relay_state="1|", scheme="https", host="api.test", path="/auth/saml"):
    request = MagicMock()
    request.url.scheme = scheme
    request.url.port = None
    request.url.path = path
    request.headers.get = lambda k, default="": host if k == "host" else default
    request.query_params = {}
    request.form = AsyncMock(
        return_value={"RelayState": relay_state, "SAMLResponse": "x"}
    )
    return request


def _fake_auth(attrs=None, nameid="user@idp.test", errors=None):
    auth = MagicMock()
    auth.process_response = MagicMock()
    auth.get_errors = MagicMock(return_value=errors or [])
    auth.get_last_error_reason = MagicMock(return_value="")
    auth.get_attributes = MagicMock(return_value=attrs or {})
    auth.get_nameid = MagicMock(return_value=nameid)
    return auth


# ===========================================================================
# relay state encode / decode
# ===========================================================================


class TestRelayState:
    def test_encode_with_redirect(self):
        assert _encode_relay_state(7, "/dashboard") == "7|/dashboard"

    def test_encode_without_redirect(self):
        assert _encode_relay_state(7, None) == "7|"

    def test_roundtrip(self):
        org_id, redirect = _decode_relay_state(_encode_relay_state(42, "/x"))
        assert org_id == 42
        assert redirect == "/x"

    def test_decode_empty_returns_none(self):
        assert _decode_relay_state("") == (None, None)
        assert _decode_relay_state(None) == (None, None)

    def test_decode_without_separator_treats_as_redirect(self):
        assert _decode_relay_state("/just-a-path") == (None, "/just-a-path")

    def test_decode_non_integer_org(self):
        assert _decode_relay_state("abc|/x") == (None, "abc|/x")

    def test_decode_org_with_empty_redirect(self):
        assert _decode_relay_state("5|") == (5, None)


# ===========================================================================
# normalize_x509_certificate
# ===========================================================================


class TestNormalizeCertificate:
    def test_empty_returns_empty(self):
        assert SamlService.normalize_x509_certificate("") == ""
        assert SamlService.normalize_x509_certificate("   ") == ""

    def test_already_wrapped_is_returned_unchanged(self):
        wrapped = "-----BEGIN CERTIFICATE-----\nBODY\n-----END CERTIFICATE-----"
        assert SamlService.normalize_x509_certificate(wrapped) == wrapped

    def test_bare_body_gets_wrapped(self):
        result = SamlService.normalize_x509_certificate("BODY")
        assert result.startswith("-----BEGIN CERTIFICATE-----")
        assert result.endswith("-----END CERTIFICATE-----")
        assert "BODY" in result

    def test_missing_only_end_marker(self):
        result = SamlService.normalize_x509_certificate(
            "-----BEGIN CERTIFICATE-----\nBODY"
        )
        assert result.endswith("-----END CERTIFICATE-----")


# ===========================================================================
# get_settings
# ===========================================================================


class TestGetSettings:
    def test_missing_org_raises_404(self, db, service):
        with pytest.raises(HTTPException) as exc:
            service.get_settings(db)
        assert exc.value.status_code == 404

    def test_missing_idp_config_raises_404(self, db, service):
        _make_org(db, idp=False)
        with pytest.raises(HTTPException) as exc:
            service.get_settings(db)
        assert exc.value.status_code == 404

    def test_missing_idp_allowed_when_not_required(self, db, service):
        _make_org(db, idp=False)
        settings = service.get_settings(db, require_idp=False)
        assert settings["idp"]["entityId"] == ""

    def test_sp_defaults_use_backend_url(self, db, service):
        _make_org(db)
        settings = service.get_settings(db)
        assert settings["sp"]["entityId"] == f"{BACKEND_URL}/saml/metadata"
        assert settings["sp"]["assertionConsumerService"]["url"] == (
            f"{BACKEND_URL}/auth/saml"
        )

    def test_sp_overrides_are_used(self, db, service):
        _make_org(db, saml_sp_entity_id="https://custom/sp")
        settings = service.get_settings(db)
        assert settings["sp"]["entityId"] == "https://custom/sp"

    def test_idp_cert_is_normalized(self, db, service):
        _make_org(db)
        settings = service.get_settings(db)
        assert settings["idp"]["x509cert"].startswith("-----BEGIN CERTIFICATE-----")
        assert settings["idp"]["entityId"] == "https://idp/entity"


# ===========================================================================
# prepare_request
# ===========================================================================


class TestPrepareRequest:
    def test_https_request(self, service):
        req = _fake_request(scheme="https", host="api.test", path="/auth/saml")
        result = SamlService.prepare_request(req)
        assert result["https"] == "on"
        assert result["http_host"] == "api.test"
        assert result["server_port"] == "443"
        assert result["script_name"] == "/auth/saml"

    def test_http_request_uses_port_80(self, service):
        req = _fake_request(scheme="http")
        result = SamlService.prepare_request(req)
        assert result["https"] == "off"
        assert result["server_port"] == "80"


# ===========================================================================
# handle_assertion
# ===========================================================================


class TestHandleAssertion:
    def test_saml_errors_raise_401(self, db, service, monkeypatch):
        _make_org(db)
        monkeypatch.setattr(
            service,
            "init_auth",
            lambda req, db: _fake_auth(errors=["invalid_response"]),
        )
        request = _fake_request(relay_state="1|")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_assertion(request, db))
        assert exc.value.status_code == 401

    def test_missing_relay_state_org_raises_400(self, db, service, monkeypatch):
        _make_org(db)
        monkeypatch.setattr(service, "init_auth", lambda req, db: _fake_auth())
        request = _fake_request(relay_state="")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_assertion(request, db))
        assert exc.value.status_code == 400

    def test_unknown_org_raises_400(self, db, service, monkeypatch):
        _make_org(db, org_id=DEFAULT_ORG_ID)
        monkeypatch.setattr(service, "init_auth", lambda req, db: _fake_auth())
        request = _fake_request(relay_state="999|")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_assertion(request, db))
        assert exc.value.status_code == 400

    def test_missing_email_raises_400(self, db, service, monkeypatch):
        _make_org(db)
        # nameid empty and no email attribute → email resolves falsy.
        monkeypatch.setattr(
            service, "init_auth", lambda req, db: _fake_auth(attrs={}, nameid="")
        )
        request = _fake_request(relay_state="1|")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_assertion(request, db))
        assert exc.value.status_code == 400

    def test_new_user_created_with_role(self, db, service, monkeypatch):
        org = _make_org(db)
        role = RoleModel(name="User")
        role.string_id = "user_role"
        db.add(role)
        db.flush()

        attrs = {
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": [
                "newbie@idp.test"
            ],
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": ["New Bie"],
        }
        monkeypatch.setattr(
            service,
            "init_auth",
            lambda req, db: _fake_auth(attrs=attrs, nameid="nameid-1"),
        )
        request = _fake_request(relay_state="1|/home")
        result = _run(service.handle_assertion(request, db))

        assert result.user.email == "newbie@idp.test"
        assert result.user.name == "New Bie"
        assert result.user.saml_nameid == "nameid-1"
        assert org in result.user.organizations
        assert any(r.string_id == "user_role" for r in result.user.roles)
        assert result.relay_state == "/home"
        assert result.access_token

    def test_existing_user_linked_and_nameid_set(self, db, service, monkeypatch):
        org = _make_org(db)
        existing = UserModel(email="known@idp.test", name="Known", signed_up=True)
        db.add(existing)
        db.flush()

        attrs = {
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress": [
                "known@idp.test"
            ],
        }
        monkeypatch.setattr(
            service,
            "init_auth",
            lambda req, db: _fake_auth(attrs=attrs, nameid="nameid-2"),
        )
        request = _fake_request(relay_state="1|")
        result = _run(service.handle_assertion(request, db))

        assert result.user.id == existing.id
        assert result.user.saml_nameid == "nameid-2"
        assert org in result.user.organizations

    def test_custom_attribute_mapping_is_respected(self, db, service, monkeypatch):
        org = _make_org(db, saml_attribute_mapping={"email": "mail", "name": "cn"})
        attrs = {"mail": ["mapped@idp.test"], "cn": ["Mapped Name"]}
        monkeypatch.setattr(
            service,
            "init_auth",
            lambda req, db: _fake_auth(attrs=attrs, nameid="nameid-3"),
        )
        request = _fake_request(relay_state=f"{org.id}|")
        result = _run(service.handle_assertion(request, db))
        assert result.user.email == "mapped@idp.test"
        assert result.user.name == "Mapped Name"

    def test_unexpected_error_is_wrapped_as_401(self, db, service, monkeypatch):
        _make_org(db)

        def _boom(req, db):
            raise RuntimeError("parser exploded")

        monkeypatch.setattr(service, "init_auth", _boom)
        request = _fake_request(relay_state="1|")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_assertion(request, db))
        assert exc.value.status_code == 401
