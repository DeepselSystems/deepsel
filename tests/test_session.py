"""Tests for deepsel.auth.session — session store backends."""

import json
import time
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from deepsel.auth.session import (
    FileSessionStore,
    PostgresSessionStore,
    SessionData,
    create_session_store,
    generate_session_id,
)


# ---------------------------------------------------------------------------
# SessionData unit tests
# ---------------------------------------------------------------------------


class TestSessionData:
    def test_create(self):
        now = datetime.now(UTC)
        sd = SessionData(
            session_id="abc",
            user_id=42,
            created_at=now,
            expires_at=now + timedelta(hours=1),
            ip="127.0.0.1",
            user_agent="test",
        )
        assert sd.session_id == "abc"
        assert sd.user_id == 42
        assert sd.ip == "127.0.0.1"

    def test_is_expired_false(self):
        now = datetime.now(UTC)
        sd = SessionData(
            session_id="x",
            user_id=1,
            created_at=now,
            expires_at=now + timedelta(hours=1),
        )
        assert sd.is_expired is False

    def test_is_expired_true(self):
        now = datetime.now(UTC)
        sd = SessionData(
            session_id="x",
            user_id=1,
            created_at=now - timedelta(hours=2),
            expires_at=now - timedelta(hours=1),
        )
        assert sd.is_expired is True

    def test_to_dict_roundtrip(self):
        now = datetime.now(UTC)
        sd = SessionData(
            session_id="test-id",
            user_id=99,
            created_at=now,
            expires_at=now + timedelta(seconds=3600),
            ip="10.0.0.1",
            user_agent="Mozilla/5.0",
        )
        d = sd.to_dict()
        restored = SessionData.from_dict(d)
        assert restored.session_id == sd.session_id
        assert restored.user_id == sd.user_id
        assert restored.ip == sd.ip
        assert restored.user_agent == sd.user_agent
        assert abs((restored.expires_at - sd.expires_at).total_seconds()) < 1


class TestGenerateSessionId:
    def test_length(self):
        sid = generate_session_id()
        assert len(sid) == 43  # 32 bytes → 43 URL-safe base64 chars

    def test_unique(self):
        ids = {generate_session_id() for _ in range(100)}
        assert len(ids) == 100


# ---------------------------------------------------------------------------
# FileSessionStore tests
# ---------------------------------------------------------------------------


class TestFileSessionStore:
    @pytest.fixture
    def store(self, tmp_path):
        return FileSessionStore(str(tmp_path / "sessions"))

    def test_create_and_get(self, store):
        session = store.create(user_id=1, ttl_seconds=3600, ip="1.2.3.4")
        assert session.user_id == 1
        assert session.ip == "1.2.3.4"

        retrieved = store.get(session.session_id)
        assert retrieved is not None
        assert retrieved.user_id == 1
        assert retrieved.session_id == session.session_id

    def test_get_nonexistent(self, store):
        assert store.get("nonexistent") is None

    def test_get_expired(self, store):
        session = store.create(user_id=1, ttl_seconds=0)
        # ttl=0 means expires_at == created_at, so it's immediately expired
        time.sleep(0.01)
        assert store.get(session.session_id) is None

    def test_delete(self, store):
        session = store.create(user_id=1, ttl_seconds=3600)
        store.delete(session.session_id)
        assert store.get(session.session_id) is None

    def test_delete_nonexistent(self, store):
        store.delete("nonexistent")  # should not raise

    def test_delete_for_user(self, store):
        s1 = store.create(user_id=10, ttl_seconds=3600)
        s2 = store.create(user_id=10, ttl_seconds=3600)
        s3 = store.create(user_id=20, ttl_seconds=3600)

        count = store.delete_for_user(10)
        assert count == 2
        assert store.get(s1.session_id) is None
        assert store.get(s2.session_id) is None
        assert store.get(s3.session_id) is not None

    def test_delete_for_user_none(self, store):
        assert store.delete_for_user(999) == 0

    def test_corrupt_file_handled(self, store, tmp_path):
        session = store.create(user_id=1, ttl_seconds=3600)
        # Corrupt the file
        path = store._path(session.session_id)
        path.write_text("not valid json{{{")
        assert store.get(session.session_id) is None

    def test_create_directory_auto(self, tmp_path):
        deep_path = str(tmp_path / "a" / "b" / "c")
        store = FileSessionStore(deep_path)
        session = store.create(user_id=1, ttl_seconds=60)
        assert store.get(session.session_id) is not None


# ---------------------------------------------------------------------------
# PostgresSessionStore tests
# ---------------------------------------------------------------------------


class TestPostgresSessionStore:
    @pytest.fixture
    def store(self, pg_url):
        engine = create_engine(pg_url)
        Session = sessionmaker(bind=engine)

        @contextmanager
        def db_factory():
            session = Session()
            try:
                yield session
            finally:
                session.close()

        return PostgresSessionStore(db_factory)

    def test_create_and_get(self, store):
        session = store.create(user_id=1, ttl_seconds=3600, ip="10.0.0.1", user_agent="test-agent")
        assert session.user_id == 1

        retrieved = store.get(session.session_id)
        assert retrieved is not None
        assert retrieved.user_id == 1
        assert retrieved.ip == "10.0.0.1"
        assert retrieved.user_agent == "test-agent"

    def test_get_nonexistent(self, store):
        assert store.get("does-not-exist") is None

    def test_get_expired(self, store):
        session = store.create(user_id=1, ttl_seconds=0)
        time.sleep(0.01)
        assert store.get(session.session_id) is None

    def test_delete(self, store):
        session = store.create(user_id=1, ttl_seconds=3600)
        store.delete(session.session_id)
        assert store.get(session.session_id) is None

    def test_delete_nonexistent(self, store):
        store.delete("nonexistent")  # should not raise

    def test_delete_for_user(self, store):
        s1 = store.create(user_id=50, ttl_seconds=3600)
        s2 = store.create(user_id=50, ttl_seconds=3600)
        s3 = store.create(user_id=60, ttl_seconds=3600)

        count = store.delete_for_user(50)
        assert count == 2
        assert store.get(s1.session_id) is None
        assert store.get(s2.session_id) is None
        assert store.get(s3.session_id) is not None

    def test_touch(self, store):
        session = store.create(user_id=1, ttl_seconds=60)
        original = store.get(session.session_id)

        result = store.touch(session.session_id, ttl_seconds=7200)
        assert result is True

        updated = store.get(session.session_id)
        assert updated.expires_at > original.expires_at

    def test_touch_nonexistent(self, store):
        assert store.touch("nonexistent", 3600) is False


# ---------------------------------------------------------------------------
# create_session_store factory tests
# ---------------------------------------------------------------------------


class TestCreateSessionStore:
    def test_filesystem_fallback(self, tmp_path):
        store = create_session_store(session_dir=str(tmp_path / "sess"))
        assert isinstance(store, FileSessionStore)

    def test_postgres_backend(self, pg_url):
        engine = create_engine(pg_url)
        Session = sessionmaker(bind=engine)

        @contextmanager
        def db_factory():
            session = Session()
            try:
                yield session
            finally:
                session.close()

        store = create_session_store(db_session_factory=db_factory, backend="postgres")
        assert isinstance(store, PostgresSessionStore)

    def test_explicit_filesystem_backend(self, tmp_path):
        store = create_session_store(
            backend="filesystem",
            session_dir=str(tmp_path / "explicit"),
        )
        assert isinstance(store, FileSessionStore)

    def test_auto_detect_prefers_postgres(self, pg_url):
        engine = create_engine(pg_url)
        Session = sessionmaker(bind=engine)

        @contextmanager
        def db_factory():
            session = Session()
            try:
                yield session
            finally:
                session.close()

        store = create_session_store(db_session_factory=db_factory)
        assert isinstance(store, PostgresSessionStore)

    def test_redis_fallback_to_postgres(self, pg_url):
        engine = create_engine(pg_url)
        Session = sessionmaker(bind=engine)

        @contextmanager
        def db_factory():
            session = Session()
            try:
                yield session
            finally:
                session.close()

        # Invalid redis URL should fall back to postgres
        store = create_session_store(
            redis_url="redis://localhost:19999",
            db_session_factory=db_factory,
        )
        assert isinstance(store, PostgresSessionStore)


# ---------------------------------------------------------------------------
# AuthService session integration tests
# ---------------------------------------------------------------------------


class TestAuthServiceSession:
    def test_login_result_has_session_id(self):
        from deepsel.auth.types import LoginResult

        result = LoginResult(
            access_token="tok",
            user=None,
            session_id="sess-123",
        )
        assert result.session_id == "sess-123"

    def test_login_result_session_id_default_none(self):
        from deepsel.auth.types import LoginResult

        result = LoginResult(access_token="tok", user=None)
        assert result.session_id is None

    def test_service_validate_session(self, tmp_path):
        from deepsel.auth.service import AuthService

        store = FileSessionStore(str(tmp_path / "sess"))
        service = AuthService(
            app_secret="secret",
            auth_algorithm="HS256",
            default_org_id=1,
            password_context=None,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
            session_store=store,
        )

        session = store.create(user_id=42, ttl_seconds=3600)
        data = service.validate_session(session.session_id)
        assert data is not None
        assert data["user_id"] == 42

    def test_service_validate_session_invalid(self, tmp_path):
        from deepsel.auth.service import AuthService

        store = FileSessionStore(str(tmp_path / "sess"))
        service = AuthService(
            app_secret="secret",
            auth_algorithm="HS256",
            default_org_id=1,
            password_context=None,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
            session_store=store,
        )
        assert service.validate_session("nonexistent") is None

    def test_service_invalidate_session(self, tmp_path):
        from deepsel.auth.service import AuthService

        store = FileSessionStore(str(tmp_path / "sess"))
        service = AuthService(
            app_secret="secret",
            auth_algorithm="HS256",
            default_org_id=1,
            password_context=None,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
            session_store=store,
        )

        session = store.create(user_id=1, ttl_seconds=3600)
        service.invalidate_session(session.session_id)
        assert store.get(session.session_id) is None

    def test_service_invalidate_user_sessions(self, tmp_path):
        from deepsel.auth.service import AuthService

        store = FileSessionStore(str(tmp_path / "sess"))
        service = AuthService(
            app_secret="secret",
            auth_algorithm="HS256",
            default_org_id=1,
            password_context=None,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
            session_store=store,
        )

        store.create(user_id=5, ttl_seconds=3600)
        store.create(user_id=5, ttl_seconds=3600)
        store.create(user_id=6, ttl_seconds=3600)

        count = service.invalidate_user_sessions(5)
        assert count == 2

    def test_service_no_store_returns_none(self):
        from deepsel.auth.service import AuthService

        service = AuthService(
            app_secret="secret",
            auth_algorithm="HS256",
            default_org_id=1,
            password_context=None,
            encrypt_fn=lambda x: x,
            decrypt_fn=lambda x: x,
        )
        assert service.validate_session("anything") is None
        assert service.invalidate_user_sessions(1) == 0
        service.invalidate_session("anything")  # should not raise
