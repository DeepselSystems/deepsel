"""Test bootstrap + shared fixtures for the packaged deepsel apps (``core``, ``cms``).

These apps are meant to be wired up by a *consuming* project that injects a
SQLAlchemy declarative ``Base`` + FastAPI deps via ``deepsel.deps.configure_deps``
and registers the app models in ``deepsel.utils.models_pool``. Their modules read
both at *import* time — e.g. ``deepsel/apps/cms/models/form.py`` does
``UserModel = models_pool["user"]`` at module level and
``deepsel/apps/cms/__init__.py`` builds ``CMSSettingsModel`` on
``models_pool["organization"]`` — so the ``cms`` models can only be imported once
the ``core`` models are already registered.

This conftest sits above every app's tests, so pytest imports it first. It does
exactly what ``main.py`` (the real consumer) does: point the package at the root
``db.py`` Base via ``configure_deps``, then scan the real ``core`` and ``cms`` apps
— ``core`` first — so both test suites exercise the real models on a single Base.
"""

import uuid

import psycopg
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

# Import from deepsel.utils first to fully initialize the package before
# deepsel.orm, avoiding a known package-level circular import between
# deepsel.orm and deepsel.utils.crud_router.
from deepsel.utils.models_pool import (
    resolve_installed_apps,
    scan_and_register_models,
)
from deepsel.deps import configure_deps

import settings
from db import Base as root_base, get_db, get_db_context

# Wire the deepsel package to the consumer's root ``db.py`` Base and deps, exactly
# as ``main.py`` does. Every ``core`` and ``cms`` model binds here (via
# ``from deepsel.deps import Base``) and the fixtures below ``create_all`` on it.
configure_deps(
    base=root_base,
    get_db_func=get_db,
    get_db_context_func=get_db_context,
    settings_obj=settings,
)

# Register the real models once — ``core`` before ``cms``, since the cms model
# modules read the core models out of ``models_pool`` at import time.
scan_and_register_models(
    app_modules=resolve_installed_apps(
        installed_apps="core, cms",
        app_dirs=settings.APP_DIRS,
        base_dir=settings._backend_dir,
    )
)


# --- Shared Postgres fixtures (one container for the whole app test session) ---


@pytest.fixture(scope="session")
def pg_container():
    """Start a Postgres container for the entire test session."""
    with PostgresContainer("postgres:16", driver="psycopg") as pg:
        yield pg


@pytest.fixture(scope="session")
def pg_url(pg_container):
    """SQLAlchemy connection URL for the Postgres container."""
    return pg_container.get_connection_url()


@pytest.fixture
def raw_pg_url(pg_url):
    """Raw PostgreSQL URL without the SQLAlchemy driver prefix."""
    return pg_url.replace("postgresql+psycopg://", "postgresql://")


@pytest.fixture
def pg_conn(raw_pg_url):
    """A Postgres connection per test with autocommit disabled."""
    with psycopg.connect(raw_pg_url, autocommit=False) as conn:
        yield conn
        conn.rollback()


@pytest.fixture
def isolated_schema(pg_conn):
    """Create an isolated schema per test to avoid cross-test conflicts."""
    schema_name = f"test_{uuid.uuid4().hex[:12]}"
    pg_conn.execute(f'CREATE SCHEMA "{schema_name}"')
    pg_conn.execute(f'SET search_path TO "{schema_name}"')
    pg_conn.commit()

    yield schema_name

    pg_conn.execute(f'DROP SCHEMA "{schema_name}" CASCADE')
    pg_conn.commit()


@pytest.fixture
def db(pg_url, isolated_schema):
    """SQLAlchemy session bound to an isolated per-test schema.

    Tables are created from the root ``db.py`` Base — the one every core and cms
    model is registered on above.
    """
    db_url = f"{pg_url}?options=-c%20search_path%3D{isolated_schema}"
    engine = create_engine(db_url)
    root_base.metadata.create_all(engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def app(pg_url, isolated_schema):
    """FastAPI ``TestClient`` with the DB dependency pointed at the test schema."""
    from main import app as fastapi_app

    db_url = f"{pg_url}?options=-c%20search_path%3D{isolated_schema}"
    engine = create_engine(db_url)
    root_base.metadata.create_all(engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    fastapi_app.dependency_overrides[get_db] = override_get_db

    from fastapi.testclient import TestClient

    with TestClient(fastapi_app) as client:
        yield client

    fastapi_app.dependency_overrides.clear()
    engine.dispose()
