"""Server-side session store for cookie-based authentication.

Provides an abstract SessionStore interface with concrete backends:
- RedisSessionStore  — fastest, requires `redis` package + running Redis server
- PostgresSessionStore — uses existing SQLAlchemy engine, no extra infra
- FileSessionStore   — zero-dependency fallback, stores JSON files on disk

Use `create_session_store()` to auto-detect the best available backend.
"""

import json
import logging
import os
import secrets
import shutil
from abc import ABC, abstractmethod
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import Column, DateTime, Integer, String, Text, delete, select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SESSION_ID_BYTES = 32  # 256-bit entropy → 43 URL-safe chars


def generate_session_id() -> str:
    return secrets.token_urlsafe(SESSION_ID_BYTES)


class SessionData:
    """In-memory representation of a session."""

    __slots__ = ("session_id", "user_id", "created_at", "expires_at", "ip", "user_agent")

    def __init__(
        self,
        session_id: str,
        user_id: int,
        created_at: datetime,
        expires_at: datetime,
        ip: str = "",
        user_agent: str = "",
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.created_at = created_at
        self.expires_at = expires_at
        self.ip = ip
        self.user_agent = user_agent

    @property
    def is_expired(self) -> bool:
        return datetime.now(UTC) >= self.expires_at

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "ip": self.ip,
            "user_agent": self.user_agent,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SessionData":
        return cls(
            session_id=data["session_id"],
            user_id=data["user_id"],
            created_at=datetime.fromisoformat(data["created_at"]),
            expires_at=datetime.fromisoformat(data["expires_at"]),
            ip=data.get("ip", ""),
            user_agent=data.get("user_agent", ""),
        )


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------


class SessionStore(ABC):
    """Abstract session store — all backends implement this interface."""

    @abstractmethod
    def create(
        self,
        user_id: int,
        ttl_seconds: int,
        ip: str = "",
        user_agent: str = "",
    ) -> SessionData:
        """Create a new session and return it."""

    @abstractmethod
    def get(self, session_id: str) -> Optional[SessionData]:
        """Return the session if it exists and is not expired, else None."""

    @abstractmethod
    def delete(self, session_id: str) -> None:
        """Delete a single session."""

    @abstractmethod
    def delete_for_user(self, user_id: int) -> int:
        """Delete all sessions for a user. Returns count deleted."""

    def touch(self, session_id: str, ttl_seconds: int) -> bool:
        """Extend the session expiry. Default implementation is a no-op returning False."""
        return False


# ---------------------------------------------------------------------------
# Redis backend
# ---------------------------------------------------------------------------


class RedisSessionStore(SessionStore):
    """Session store backed by Redis (or any Redis-protocol-compatible store)."""

    _PREFIX = "sess:"

    def __init__(self, redis_url: str):
        try:
            import redis as redis_lib
        except ImportError as exc:
            raise ImportError(
                "redis package is required for RedisSessionStore. "
                "Install it with: pip install redis"
            ) from exc

        self._redis = redis_lib.Redis.from_url(redis_url, decode_responses=True)
        # Verify connectivity
        self._redis.ping()
        logger.info("RedisSessionStore connected to %s", redis_url)

    def _key(self, session_id: str) -> str:
        return f"{self._PREFIX}{session_id}"

    def _user_key(self, user_id: int) -> str:
        return f"{self._PREFIX}user:{user_id}"

    def create(self, user_id: int, ttl_seconds: int, ip: str = "", user_agent: str = "") -> SessionData:
        now = datetime.now(UTC)
        session = SessionData(
            session_id=generate_session_id(),
            user_id=user_id,
            created_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
            ip=ip,
            user_agent=user_agent,
        )
        pipe = self._redis.pipeline()
        pipe.set(self._key(session.session_id), json.dumps(session.to_dict()), ex=ttl_seconds)
        pipe.sadd(self._user_key(user_id), session.session_id)
        pipe.expire(self._user_key(user_id), ttl_seconds)
        pipe.execute()
        return session

    def get(self, session_id: str) -> Optional[SessionData]:
        raw = self._redis.get(self._key(session_id))
        if raw is None:
            return None
        session = SessionData.from_dict(json.loads(raw))
        if session.is_expired:
            self.delete(session_id)
            return None
        return session

    def delete(self, session_id: str) -> None:
        raw = self._redis.get(self._key(session_id))
        if raw:
            data = json.loads(raw)
            self._redis.srem(self._user_key(data["user_id"]), session_id)
        self._redis.delete(self._key(session_id))

    def delete_for_user(self, user_id: int) -> int:
        ukey = self._user_key(user_id)
        session_ids = self._redis.smembers(ukey)
        if not session_ids:
            return 0
        pipe = self._redis.pipeline()
        for sid in session_ids:
            pipe.delete(self._key(sid))
        pipe.delete(ukey)
        pipe.execute()
        return len(session_ids)

    def touch(self, session_id: str, ttl_seconds: int) -> bool:
        raw = self._redis.get(self._key(session_id))
        if raw is None:
            return False
        data = json.loads(raw)
        data["expires_at"] = (datetime.now(UTC) + timedelta(seconds=ttl_seconds)).isoformat()
        self._redis.set(self._key(session_id), json.dumps(data), ex=ttl_seconds)
        return True


# ---------------------------------------------------------------------------
# PostgreSQL backend (uses SQLAlchemy)
# ---------------------------------------------------------------------------


class PostgresSessionStore(SessionStore):
    """Session store backed by a PostgreSQL table via SQLAlchemy."""

    def __init__(self, db_session_factory):
        """
        Args:
            db_session_factory: callable that returns a SQLAlchemy Session
                                (e.g. the get_db_context context manager).
        """
        from sqlalchemy.orm import registry

        self._db_factory = db_session_factory
        self._mapper_registry = registry()
        self._table_ensured = False

        # Declare the model
        @self._mapper_registry.mapped
        class AuthSession:
            __tablename__ = "auth_session"
            session_id: str = Column(String(64), primary_key=True)
            user_id: int = Column(Integer, nullable=False, index=True)
            created_at: datetime = Column(DateTime(timezone=True), nullable=False)
            expires_at: datetime = Column(DateTime(timezone=True), nullable=False)
            ip: str = Column(String(45), default="")
            user_agent: str = Column(Text, default="")

        self._model = AuthSession
        logger.info("PostgresSessionStore initialized")

    def _ensure_table(self, db: Session) -> None:
        if self._table_ensured:
            return
        self._mapper_registry.metadata.create_all(db.get_bind())
        self._table_ensured = True

    def create(self, user_id: int, ttl_seconds: int, ip: str = "", user_agent: str = "") -> SessionData:
        now = datetime.now(UTC)
        session = SessionData(
            session_id=generate_session_id(),
            user_id=user_id,
            created_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
            ip=ip,
            user_agent=user_agent,
        )
        with self._db_factory() as db:
            self._ensure_table(db)
            row = self._model(
                session_id=session.session_id,
                user_id=session.user_id,
                created_at=session.created_at,
                expires_at=session.expires_at,
                ip=session.ip,
                user_agent=session.user_agent,
            )
            db.add(row)
            db.commit()
        return session

    def get(self, session_id: str) -> Optional[SessionData]:
        with self._db_factory() as db:
            self._ensure_table(db)
            row = db.execute(
                select(self._model).where(self._model.session_id == session_id)
            ).scalar_one_or_none()
            if row is None:
                return None
            session = SessionData(
                session_id=row.session_id,
                user_id=row.user_id,
                created_at=row.created_at.replace(tzinfo=UTC) if row.created_at.tzinfo is None else row.created_at,
                expires_at=row.expires_at.replace(tzinfo=UTC) if row.expires_at.tzinfo is None else row.expires_at,
                ip=row.ip or "",
                user_agent=row.user_agent or "",
            )
            if session.is_expired:
                db.execute(delete(self._model).where(self._model.session_id == session_id))
                db.commit()
                return None
            return session

    def delete(self, session_id: str) -> None:
        with self._db_factory() as db:
            self._ensure_table(db)
            db.execute(delete(self._model).where(self._model.session_id == session_id))
            db.commit()

    def delete_for_user(self, user_id: int) -> int:
        with self._db_factory() as db:
            self._ensure_table(db)
            result = db.execute(delete(self._model).where(self._model.user_id == user_id))
            db.commit()
            return result.rowcount

    def touch(self, session_id: str, ttl_seconds: int) -> bool:
        with self._db_factory() as db:
            self._ensure_table(db)
            row = db.execute(
                select(self._model).where(self._model.session_id == session_id)
            ).scalar_one_or_none()
            if row is None:
                return False
            row.expires_at = datetime.now(UTC) + timedelta(seconds=ttl_seconds)
            db.commit()
            return True


# ---------------------------------------------------------------------------
# Filesystem backend (zero-dependency fallback)
# ---------------------------------------------------------------------------


class FileSessionStore(SessionStore):
    """Session store backed by JSON files on disk. Good for dev/single-server."""

    def __init__(self, directory: str = "/tmp/deepsel-sessions"):  # nosec B108
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)
        logger.info("FileSessionStore using %s", self._dir)

    def _path(self, session_id: str) -> Path:
        # Sanitize session_id to prevent path traversal
        safe_id = session_id.replace("/", "_").replace("..", "_")
        return self._dir / f"{safe_id}.json"

    def create(self, user_id: int, ttl_seconds: int, ip: str = "", user_agent: str = "") -> SessionData:
        now = datetime.now(UTC)
        session = SessionData(
            session_id=generate_session_id(),
            user_id=user_id,
            created_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
            ip=ip,
            user_agent=user_agent,
        )
        self._path(session.session_id).write_text(json.dumps(session.to_dict()))
        return session

    def get(self, session_id: str) -> Optional[SessionData]:
        path = self._path(session_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            session = SessionData.from_dict(data)
            if session.is_expired:
                path.unlink(missing_ok=True)
                return None
            return session
        except (json.JSONDecodeError, KeyError):
            path.unlink(missing_ok=True)
            return None

    def delete(self, session_id: str) -> None:
        self._path(session_id).unlink(missing_ok=True)

    def delete_for_user(self, user_id: int) -> int:
        count = 0
        for path in self._dir.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                if data.get("user_id") == user_id:
                    path.unlink(missing_ok=True)
                    count += 1
            except (json.JSONDecodeError, KeyError):
                path.unlink(missing_ok=True)
        return count


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_session_store(
    redis_url: Optional[str] = None,
    db_session_factory: Any = None,
    session_dir: Optional[str] = None,
    backend: Optional[str] = None,
) -> SessionStore:
    """Auto-detect and create the best available session store.

    Priority when backend is None: redis → postgres → filesystem.

    Args:
        redis_url: Redis connection URL (e.g. "redis://localhost:6379").
        db_session_factory: Callable returning a SQLAlchemy Session context manager.
        session_dir: Directory for filesystem sessions.
        backend: Force a specific backend ("redis", "postgres", "filesystem").
    """
    if backend == "redis" or (backend is None and redis_url):
        try:
            return RedisSessionStore(redis_url or "redis://localhost:6379")
        except Exception as exc:
            if backend == "redis":
                raise
            logger.warning("Redis unavailable (%s), trying next backend", exc)

    if backend == "postgres" or (backend is None and db_session_factory):
        try:
            return PostgresSessionStore(db_session_factory)
        except Exception as exc:
            if backend == "postgres":
                raise
            logger.warning("Postgres session store failed (%s), falling back to filesystem", exc)

    directory = session_dir or os.getenv("SESSION_DIR", "/tmp/deepsel-sessions")  # nosec B108
    return FileSessionStore(directory)
