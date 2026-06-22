import uuid

import psycopg
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Importing the cms package (which any test module here triggers) requires the
# core models + deps to already be configured. That bootstrap lives in
# ``deepsel/apps/conftest.py`` and runs before this file. ``deepsel.deps.Base``
# is the declarative base it set up and that the cms models bind to.
import deepsel.deps as deps


@pytest.fixture(scope="session")
def pg_container():
    """Start a Postgres container for the entire test session."""
    from testcontainers.postgres import PostgresContainer

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

    # Create all tables registered on the shared base in the isolated schema.
    deps.Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
