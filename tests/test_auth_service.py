import json

import jwt
import pyotp
import pytest
from fastapi import HTTPException
from passlib.context import CryptContext
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

from deepsel.auth.service import AuthService
from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.user_mixin import UserMixin
from deepsel.utils.crypto import hash_text
from deepsel.utils.models_pool import models_pool

# ---------------------------------------------------------------------------
# Test config / constants
# ---------------------------------------------------------------------------

APP_SECRET = "test-secret"
AUTH_ALGORITHM = "HS256"
DEFAULT_ORG_ID = 1

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Base = declarative_base()

# Junction tables -----------------------------------------------------------

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


# Models --------------------------------------------------------------------


class OrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    access_token_expire_minutes = Column(Integer, nullable=True)
    require_2fa_all_users = Column(Boolean, default=False)
    enable_auth = Column(Boolean, default=True)


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    permissions = Column(String, nullable=True)


class UserModel(Base, ORMBaseMixin, UserMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=True)
    username = Column(String(255), unique=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    is_use_2fa = Column(Boolean, default=False)
    secret_key_2fa = Column(String, nullable=True)
    temp_secret_key_2fa = Column(String, nullable=True)
    recovery_codes = Column(String, nullable=True)
    signed_up = Column(Boolean, default=False)
    anonymous_id = Column(String, nullable=True)

    organizations = relationship("OrganizationModel", secondary="user_organization")
    roles = relationship("RoleModel", secondary="user_role")

    @classmethod
    def _get_app_secret(cls) -> str:
        return APP_SECRET

    @classmethod
    def _get_auth_algorithm(cls) -> str:
        return AUTH_ALGORITHM

    @classmethod
    def _get_frontend_url(cls) -> str:
        return "https://frontend.test"

    @classmethod
    def _get_is_authless(cls) -> bool:
        return False

    @classmethod
    def _get_default_org_id(cls) -> int:
        return DEFAULT_ORG_ID

    @classmethod
    def _get_password_context(cls):
        return password_context

    @classmethod
    def _get_admin_role_string_ids(cls) -> list[str]:
        return ["admin_role", "super_admin_role"]

    @classmethod
    def _get_admin_user_string_id(cls) -> str:
        return "admin_user"

    @classmethod
    def _get_set_password_template_id(cls) -> str:
        return "set_password_template"

    @classmethod
    def _get_reset_password_template_id(cls) -> str:
        return "reset_password_template"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeSession:
    def __init__(self, session_id="sess-123"):
        self.session_id = session_id


class FakeSessionStore:
    def __init__(self):
        self.created = []

    def create(self, user_id, ttl_seconds, ip="", user_agent=""):
        self.created.append({"user_id": user_id, "ttl_seconds": ttl_seconds})
        return FakeSession(session_id=f"sess-{user_id}")


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
    models_pool["user"] = UserModel
    models_pool["organization"] = OrganizationModel
    models_pool["role"] = RoleModel
    models_pool["user_organization"] = user_organization_table
    models_pool["user_role"] = user_role_table

    yield session

    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


@pytest.fixture
def service():
    return AuthService(
        app_secret=APP_SECRET,
        auth_algorithm=AUTH_ALGORITHM,
        default_org_id=DEFAULT_ORG_ID,
        password_context=password_context,
        encrypt_fn=lambda x: x,
        decrypt_fn=lambda x: x,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_org(db, org_id=DEFAULT_ORG_ID, **kwargs):
    org = OrganizationModel(id=org_id, name=f"Org{org_id}", **kwargs)
    db.add(org)
    db.flush()
    return org


def _make_user(
    db,
    email="user@test.com",
    username="user1",
    password="password123",
    orgs=None,
    **kwargs,
):
    user = UserModel(
        email=email,
        username=username,
        hashed_password=password_context.hash(password),
        signed_up=True,
        **kwargs,
    )
    if orgs:
        user.organizations.extend(orgs)
    db.add(user)
    db.flush()
    return user


# ===========================================================================
# Login
# ===========================================================================


class TestLogin:
    def test_login_happy_path(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])

        result = service.login(db, org.id, "user@test.com", "password123")

        assert result.require_2fa_setup is False
        assert result.user is user
        assert result.session_id is None
        payload = service._decode_token(result.access_token)
        assert payload["uid"] == user.id
        assert payload["org_id"] == org.id

    def test_login_by_username(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        result = service.login(db, org.id, "user1", "password123")
        assert result.user is user

    def test_login_wrong_password_401(self, db, service):
        org = _make_org(db)
        _make_user(db, orgs=[org])
        with pytest.raises(HTTPException) as exc:
            service.login(db, org.id, "user@test.com", "wrong")
        assert exc.value.status_code == 401

    def test_login_unknown_user_401(self, db, service):
        org = _make_org(db)
        with pytest.raises(HTTPException) as exc:
            service.login(db, org.id, "nobody@test.com", "password123")
        assert exc.value.status_code == 401

    def test_login_inactive_user_401(self, db, service):
        org = _make_org(db)
        _make_user(db, orgs=[org], active=False)
        with pytest.raises(HTTPException) as exc:
            service.login(db, org.id, "user@test.com", "password123")
        assert exc.value.status_code == 401

    def test_login_not_member_of_org_403(self, db, service):
        member_org = _make_org(db, org_id=1)
        other_org = _make_org(db, org_id=2)
        _make_user(db, orgs=[member_org])
        with pytest.raises(HTTPException) as exc:
            service.login(db, other_org.id, "user@test.com", "password123")
        assert exc.value.status_code == 403

    def test_login_require_2fa_setup(self, db, service):
        org = _make_org(db, require_2fa_all_users=True)
        _make_user(db, orgs=[org])
        result = service.login(db, org.id, "user@test.com", "password123")
        assert result.require_2fa_setup is True
        assert result.access_token == ""
        assert result.user is None

    def test_login_2fa_valid_otp(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db)
        user = _make_user(db, orgs=[org], is_use_2fa=True, secret_key_2fa=secret)
        otp = pyotp.TOTP(secret).now()
        result = service.login(db, org.id, "user@test.com", "password123", otp=otp)
        assert result.user is user
        assert result.access_token

    def test_login_2fa_invalid_otp_no_recovery_401(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db)
        _make_user(db, orgs=[org], is_use_2fa=True, secret_key_2fa=secret)
        with pytest.raises(HTTPException) as exc:
            service.login(db, org.id, "user@test.com", "password123", otp="000000")
        assert exc.value.status_code == 401

    def test_login_2fa_recovery_code_consumed(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db)
        codes = ["RECOVERY-A", "RECOVERY-B"]
        hashed = [hash_text(c) for c in codes]
        user = _make_user(
            db,
            orgs=[org],
            is_use_2fa=True,
            secret_key_2fa=secret,
            recovery_codes=json.dumps(hashed),
        )
        result = service.login(
            db, org.id, "user@test.com", "password123", otp="RECOVERY-A"
        )
        assert result.user is user
        # the matching code was popped, one remains
        remaining = json.loads(user.recovery_codes)
        assert len(remaining) == 1

    def test_login_2fa_last_recovery_code_sets_none(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db)
        codes = ["ONLY-CODE"]
        hashed = [hash_text(c) for c in codes]
        user = _make_user(
            db,
            orgs=[org],
            is_use_2fa=True,
            secret_key_2fa=secret,
            recovery_codes=json.dumps(hashed),
        )
        result = service.login(
            db, org.id, "user@test.com", "password123", otp="ONLY-CODE"
        )
        assert result.user is user
        assert user.recovery_codes is None

    def test_login_with_session_store(self, db):
        store = FakeSessionStore()
        svc = AuthService(
            app_secret=APP_SECRET,
            auth_algorithm=AUTH_ALGORITHM,
            default_org_id=DEFAULT_ORG_ID,
            password_context=password_context,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
            session_store=store,
        )
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        result = svc.login(db, org.id, "user@test.com", "password123")
        assert result.session_id == f"sess-{user.id}"
        assert store.created[0]["user_id"] == user.id


# ===========================================================================
# _decode_token
# ===========================================================================


class TestDecodeToken:
    def test_valid_token(self, service):
        token = jwt.encode(
            {"uid": 5, "org_id": 1}, APP_SECRET, algorithm=AUTH_ALGORITHM
        )
        payload = service._decode_token(token)
        assert payload["uid"] == 5
        assert payload["org_id"] == 1

    def test_missing_uid_401(self, service):
        token = jwt.encode({"org_id": 1}, APP_SECRET, algorithm=AUTH_ALGORITHM)
        with pytest.raises(HTTPException) as exc:
            service._decode_token(token)
        assert exc.value.status_code == 401

    def test_bad_signature_401(self, service):
        token = jwt.encode({"uid": 5}, "wrong-secret", algorithm=AUTH_ALGORITHM)
        with pytest.raises(HTTPException) as exc:
            service._decode_token(token)
        assert exc.value.status_code == 401

    def test_garbage_token_401(self, service):
        with pytest.raises(HTTPException) as exc:
            service._decode_token("not.a.token")
        assert exc.value.status_code == 401

    def test_expired_token_401(self, service):
        from datetime import UTC, datetime, timedelta

        token = jwt.encode(
            {"uid": 5, "exp": datetime.now(UTC) - timedelta(hours=1)},
            APP_SECRET,
            algorithm=AUTH_ALGORITHM,
        )
        with pytest.raises(HTTPException) as exc:
            service._decode_token(token)
        assert exc.value.status_code == 401


# ===========================================================================
# create_access_token
# ===========================================================================


class TestAccessToken:
    def test_token_round_trips(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        token = service.create_access_token(user, org.id)
        payload = service._decode_token(token)
        assert payload["uid"] == user.id
        assert payload["org_id"] == org.id

    def test_default_expiry_24h(self, db, service):
        org = _make_org(db)
        assert service._get_org_token_expire_minutes(db, org.id) == 60 * 24

    def test_org_override_expiry(self, db, service):
        org = _make_org(db, access_token_expire_minutes=15)
        assert service._get_org_token_expire_minutes(db, org.id) == 15

    def test_token_with_db_uses_org_expiry(self, db, service):
        org = _make_org(db, access_token_expire_minutes=30)
        user = _make_user(db, orgs=[org])
        token = service.create_access_token(user, org.id, db=db)
        payload = service._decode_token(token)
        # exp should reflect ~30 min, not 24h
        from datetime import UTC, datetime

        delta_seconds = payload["exp"] - int(datetime.now(UTC).timestamp())
        assert delta_seconds < 60 * 60  # well under an hour


# ===========================================================================
# signup
# ===========================================================================


class TestSignup:
    def test_signup_happy_path(self, db, service):
        org = _make_org(db)
        result = service.signup(db, "new@test.com", "secret123", org.id)
        assert result.success is True
        assert result.user_id is not None
        user = db.query(UserModel).get(result.user_id)
        assert user.email == "new@test.com"
        assert user.signed_up is True
        assert org in user.organizations
        assert password_context.verify("secret123", user.hashed_password)

    def test_signup_assigns_public_role(self, db, service):
        org = _make_org(db)
        role = RoleModel(string_id="public_role", organization_id=org.id, name="Public")
        db.add(role)
        db.flush()
        result = service.signup(db, "withrole@test.com", "secret123", org.id)
        user = db.query(UserModel).get(result.user_id)
        assert role in user.roles

    def test_signup_duplicate_email_400(self, db, service):
        org = _make_org(db)
        _make_user(db, email="dup@test.com", orgs=[org])
        with pytest.raises(HTTPException) as exc:
            service.signup(db, "dup@test.com", "secret123", org.id)
        assert exc.value.status_code == 400

    def test_signup_missing_org_400(self, db, service):
        with pytest.raises(HTTPException) as exc:
            service.signup(db, "noorg@test.com", "secret123", 9999)
        assert exc.value.status_code == 400


# ===========================================================================
# reset_password
# ===========================================================================


class TestResetPassword:
    def _reset_token(self, service, user_id, org_id=None):
        payload = {"uid": user_id}
        if org_id is not None:
            payload["org_id"] = org_id
        return jwt.encode(payload, APP_SECRET, algorithm=AUTH_ALGORITHM)

    def test_simple_reset_changes_password(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        old_hash = user.hashed_password
        token = self._reset_token(service, user.id, org.id)

        result = service.reset_password(db, token, "brandnewpass")
        assert result.success is True
        assert user.hashed_password != old_hash
        assert password_context.verify("brandnewpass", user.hashed_password)

    def test_reset_regenerates_recovery_codes(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        token = self._reset_token(service, user.id, org.id)
        service.reset_password(db, token, "newpass1")
        codes = json.loads(user.recovery_codes)
        assert len(codes) == 16

    def test_reset_invalid_token_401(self, db, service):
        with pytest.raises(HTTPException) as exc:
            service.reset_password(db, "bad.token.here", "newpass")
        assert exc.value.status_code == 401

    def test_reset_unknown_user_401(self, db, service):
        token = self._reset_token(service, 999999)
        with pytest.raises(HTTPException) as exc:
            service.reset_password(db, token, "newpass")
        assert exc.value.status_code == 401

    def test_reset_2fa_crosscheck_invalid_otp_422(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db, require_2fa_all_users=True)
        user = _make_user(db, orgs=[org], temp_secret_key_2fa=secret)
        token = self._reset_token(service, user.id, org.id)
        with pytest.raises(HTTPException) as exc:
            service.reset_password(db, token, "newpass", crosscheck_otp="000000")
        assert exc.value.status_code == 422

    def test_reset_2fa_crosscheck_missing_otp_422(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db, require_2fa_all_users=True)
        user = _make_user(db, orgs=[org], temp_secret_key_2fa=secret)
        token = self._reset_token(service, user.id, org.id)
        with pytest.raises(HTTPException) as exc:
            service.reset_password(db, token, "newpass")
        assert exc.value.status_code == 422

    def test_reset_2fa_crosscheck_valid_promotes_secret(self, db, service):
        secret = pyotp.random_base32()
        org = _make_org(db, require_2fa_all_users=True)
        user = _make_user(db, orgs=[org], temp_secret_key_2fa=secret)
        token = self._reset_token(service, user.id, org.id)
        otp = pyotp.TOTP(secret).now()

        result = service.reset_password(
            db, token, "newpass", crosscheck_otp=otp, should_confirm_2fa=True
        )
        assert result.success is True
        assert user.secret_key_2fa == secret
        assert user.temp_secret_key_2fa is None
        assert user.is_use_2fa is True
        # recovery codes returned since user now uses 2fa
        assert len(result.recovery_codes) == 16

    def test_reset_no_recovery_codes_returned_without_2fa(self, db, service):
        org = _make_org(db)
        user = _make_user(db, orgs=[org])
        token = self._reset_token(service, user.id, org.id)
        result = service.reset_password(db, token, "newpass")
        assert result.recovery_codes == []
