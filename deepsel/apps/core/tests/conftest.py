import uuid
import pytest
import psycopg
from testcontainers.postgres import PostgresContainer
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient


# Register the real core app models on the root ``db`` Base at import time.
#
# ``deepsel/apps/conftest.py`` (imported first, as the parent conftest) seeds
# ``models_pool`` with minimal stand-in models bound to its own Base for the
# packaged CMS app tests. The core app tests instead exercise the real models,
# which bind to the root ``db.py`` Base and are only imported at app startup via
# ``scan_and_register_models``. Do that import here — at conftest import time,
# before the test modules capture ``models_pool["user"]`` — so ``Base.metadata``
# is populated (for ``create_all``) and ``models_pool`` resolves to the real
# core models, overriding the stand-ins.
def _register_core_models():
    import settings
    from deepsel.utils.models_pool import (
        resolve_installed_apps,
        scan_and_register_models,
    )

    app_modules = resolve_installed_apps(
        installed_apps="core",
        app_dirs=settings.APP_DIRS,
        base_dir=settings._backend_dir,
    )
    scan_and_register_models(app_modules=app_modules)


_register_core_models()


@pytest.fixture(scope="session")
def pg_container():
    """Start a Postgres container for the entire test session."""
    with PostgresContainer("postgres:16", driver="psycopg") as pg:
        yield pg


@pytest.fixture(scope="session")
def pg_url(pg_container):
    """Get the SQLAlchemy connection URL for the Postgres container."""
    return pg_container.get_connection_url()


@pytest.fixture
def raw_pg_url(pg_url):
    """Get raw PostgreSQL URL without SQLAlchemy driver prefix."""
    return pg_url.replace("postgresql+psycopg://", "postgresql://")


@pytest.fixture
def pg_conn(raw_pg_url):
    """Create a new Postgres connection per test with autocommit disabled."""
    with psycopg.connect(raw_pg_url, autocommit=False) as conn:
        yield conn
        conn.rollback()


@pytest.fixture
def isolated_schema(pg_conn):
    """Create an isolated schema for each test to avoid conflicts."""
    schema_name = f"test_{uuid.uuid4().hex[:12]}"
    pg_conn.execute(f'CREATE SCHEMA "{schema_name}"')
    pg_conn.execute(f'SET search_path TO "{schema_name}"')
    pg_conn.commit()

    yield schema_name

    pg_conn.execute(f'DROP SCHEMA "{schema_name}" CASCADE')
    pg_conn.commit()


@pytest.fixture
def db(pg_url, isolated_schema):
    """SQLAlchemy session bound to an isolated per-test schema."""
    db_url = f"{pg_url}?options=-c%20search_path%3D{isolated_schema}"
    engine = create_engine(db_url)

    # Create all tables in the isolated schema
    from db import Base

    Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def app(pg_url, isolated_schema):
    """FastAPI TestClient with DB overridden to use testcontainers DB."""
    from main import app as fastapi_app
    from db import get_db

    db_url = f"{pg_url}?options=-c%20search_path%3D{isolated_schema}"
    engine = create_engine(db_url)

    from db import Base

    Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db

    with TestClient(fastapi_app) as client:
        yield client

    fastapi_app.dependency_overrides.clear()
    engine.dispose()
