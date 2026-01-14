import pytest
from unittest.mock import Mock, MagicMock, patch
from sqlalchemy import Table, Column, Integer, String
from sqlalchemy.orm import declarative_base
from deepsel.sqlalchemy import DatabaseManager


@pytest.fixture
def mock_base():
    return declarative_base()


@pytest.fixture
def mock_db_session():
    session = Mock()
    session.bind = Mock()
    return session


@pytest.fixture
def mock_models_pool():
    return {"test_table": Mock()}


def test_database_manager_initialization(mock_base, mock_models_pool):
    with patch.object(DatabaseManager, "startup_database_update"):
        with patch("deepsel.sqlalchemy.db_manager.create_engine") as mock_create_engine:
            mock_engine = Mock()
            mock_create_engine.return_value = mock_engine

            db_manager = DatabaseManager(
                sqlalchemy_declarative_base=mock_base,
                db_url="postgresql://test:test@localhost/test",
                models_pool=mock_models_pool,
            )

            assert db_manager.declarative_base == mock_base
            assert db_manager.models_pool == mock_models_pool
            assert db_manager.engine == mock_engine
            mock_create_engine.assert_called_once_with(
                "postgresql://test:test@localhost/test"
            )


def test_reflect_database_schema(mock_base, mock_db_session, mock_models_pool):
    with patch.object(DatabaseManager, "startup_database_update"):
        db_manager = DatabaseManager.__new__(DatabaseManager)
        db_manager.declarative_base = mock_base
        db_manager.models_pool = mock_models_pool

        with patch("deepsel.sqlalchemy.db_manager.inspect") as mock_inspect:
            mock_inspector = Mock()
            mock_inspector.get_table_names.return_value = ["table1", "table2"]
            mock_inspector.get_columns.return_value = [
                {"name": "id", "type": Integer()},
                {"name": "name", "type": String()},
            ]
            mock_inspect.return_value = mock_inspector

            schema = db_manager.reflect_database_schema(mock_db_session)

            assert "table1" in schema
            assert "table2" in schema
