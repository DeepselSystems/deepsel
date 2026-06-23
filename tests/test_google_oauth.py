"""Tests for deepsel.auth.google_oauth.GoogleOAuthService.

Covers OAuth client configuration validation and the callback flow:
state validation, credential-exchange failure, existing-user linking, and
new-user creation + default-role assignment. The external Google/authlib
layer is mocked — no network calls.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import (
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
from deepsel.auth.google_oauth import GoogleOAuthService

APP_SECRET = "test-secret"
AUTH_ALGORITHM = "HS256"
FRONTEND_URL = "https://frontend.test"

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
    google_client_id = Column(String, nullable=True)
    google_client_secret = Column(String, nullable=True)
    google_redirect_uri = Column(String, nullable=True)


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))


class UserModel(Base, ORMBaseMixin, UserMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=True)
    name = Column(String(255), nullable=True)
    google_id = Column(String, nullable=True)
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
    # create_savepoint keeps the outer transaction intact across the
    # service's internal db.commit() calls so teardown can still roll back.
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
    return GoogleOAuthService(
        app_secret=APP_SECRET,
        auth_algorithm=AUTH_ALGORITHM,
        frontend_url=FRONTEND_URL,
    )


def _make_org(db, org_id=1, configured=True):
    kwargs = dict(name="Org", access_token_expire_minutes=60)
    if configured:
        kwargs.update(
            google_client_id="client-id",
            google_client_secret="client-secret",
            google_redirect_uri="https://app/callback",
        )
    org = OrganizationModel(id=org_id, **kwargs)
    db.add(org)
    db.flush()
    return org


def _make_request(state, userinfo=None):
    """Build a fake Starlette-style request with the OAuth callback state."""
    request = MagicMock()
    request.query_params = {"state": state} if state is not None else {}
    return request


def _patch_oauth(service, userinfo=None, raise_oauth_error=False):
    """Replace build_oauth_client so handle_callback never touches authlib/network."""
    from authlib.integrations.base_client import OAuthError

    oauth = MagicMock()
    if raise_oauth_error:
        oauth.google.authorize_access_token = AsyncMock(side_effect=OAuthError())
    else:
        token = {"userinfo": userinfo}
        oauth.google.authorize_access_token = AsyncMock(return_value=token)

    service.build_oauth_client = MagicMock(return_value=(oauth, "https://app/callback"))


# ===========================================================================
# build_oauth_client
# ===========================================================================


class TestBuildOAuthClient:
    def test_missing_org_raises_404(self, db, service):
        with pytest.raises(HTTPException) as exc:
            service.build_oauth_client(db, organization_id=999)
        assert exc.value.status_code == 404

    def test_incomplete_config_raises_404(self, db, service):
        org = _make_org(db, configured=False)
        with pytest.raises(HTTPException) as exc:
            service.build_oauth_client(db, organization_id=org.id)
        assert exc.value.status_code == 404

    def test_configured_org_returns_client_and_redirect(self, db, service):
        org = _make_org(db, configured=True)
        oauth, redirect_uri = service.build_oauth_client(db, organization_id=org.id)
        assert redirect_uri == "https://app/callback"
        assert oauth is not None


# ===========================================================================
# handle_callback — state validation
# ===========================================================================


class TestHandleCallbackStateValidation:
    def test_missing_state_raises_400(self, db, service):
        request = _make_request(state=None)
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_callback(request, db))
        assert exc.value.status_code == 400

    def test_non_integer_state_raises_400(self, db, service):
        request = _make_request(state="not-an-int")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_callback(request, db))
        assert exc.value.status_code == 400

    def test_unknown_org_raises_400(self, db, service):
        request = _make_request(state="12345")
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_callback(request, db))
        assert exc.value.status_code == 400

    def test_oauth_error_raises_401(self, db, service):
        org = _make_org(db)
        _patch_oauth(service, raise_oauth_error=True)
        request = _make_request(state=str(org.id))
        with pytest.raises(HTTPException) as exc:
            _run(service.handle_callback(request, db))
        assert exc.value.status_code == 401


# ===========================================================================
# handle_callback — user resolution
# ===========================================================================


class TestHandleCallbackUserResolution:
    def test_existing_user_is_linked(self, db, service):
        org = _make_org(db)
        existing = UserModel(email="alice@test.com", name="Alice", signed_up=True)
        db.add(existing)
        db.flush()

        _patch_oauth(
            service,
            userinfo={
                "email": "alice@test.com",
                "sub": "google-sub-1",
                "name": "Alice",
            },
        )
        request = _make_request(state=str(org.id))
        result = _run(service.handle_callback(request, db))

        assert result.user.id == existing.id
        assert result.user.google_id == "google-sub-1"
        assert org in result.user.organizations
        assert result.organization.id == org.id
        assert result.access_token

    def test_new_user_created_with_default_role(self, db, service):
        org = _make_org(db)
        role = RoleModel(name="User")
        role.string_id = "user_role"
        db.add(role)
        db.flush()

        _patch_oauth(
            service,
            userinfo={"email": "bob@test.com", "sub": "google-sub-2", "name": "Bob"},
        )
        request = _make_request(state=str(org.id))
        result = _run(service.handle_callback(request, db))

        assert result.user.email == "bob@test.com"
        assert result.user.google_id == "google-sub-2"
        assert result.user.signed_up is True
        assert org in result.user.organizations
        assert any(r.string_id == "user_role" for r in result.user.roles)

    def test_new_user_created_without_role_when_role_missing(self, db, service):
        org = _make_org(db)
        # No "user_role" Role exists — user is still created, just role-less.
        _patch_oauth(
            service,
            userinfo={"email": "carol@test.com", "sub": "sub-3", "name": "Carol"},
        )
        request = _make_request(state=str(org.id))
        result = _run(service.handle_callback(request, db))

        assert result.user.email == "carol@test.com"
        assert result.user.roles == []
