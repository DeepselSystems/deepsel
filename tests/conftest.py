import uuid
import pytest
import psycopg
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def pg_container():
    """Start a Postgres container for the entire test session."""
    with PostgresContainer("postgres:16", driver="psycopg") as pg:
        yield pg


@pytest.fixture(scope="session")
def pg_url(pg_container):
    """Get the connection URL for the Postgres container."""
    return pg_container.get_connection_url()


@pytest.fixture
def raw_pg_url(pg_url):
    """Get raw PostgreSQL URL without SQLAlchemy driver prefix."""
    # Remove SQLAlchemy driver prefix if present
    url = pg_url.replace("postgresql+psycopg://", "postgresql://")
    return url


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
def sqlalchemy_db_url(raw_pg_url, isolated_schema):
    """Get SQLAlchemy-compatible database URL with isolated schema."""
    # Convert to SQLAlchemy format with psycopg driver and add schema
    url = raw_pg_url.replace("postgresql://", "postgresql+psycopg://")
    return f"{url}?options=-c%20search_path%3D{isolated_schema}"
