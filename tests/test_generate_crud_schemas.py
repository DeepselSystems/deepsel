import pytest
from sqlalchemy import JSON, Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

from deepsel.utils.generate_crud_schemas import (
    generate_create_schema,
    generate_read_schema,
    generate_update_schema,
    generate_search_schema,
    generate_CRUD_schemas,
)
from deepsel.utils.models_pool import models_pool, set_models_pool

Base = declarative_base()


class CategoryModel(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    items = relationship("ItemModel", back_populates="category")


class ItemModel(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=True)
    owner_id = Column(Integer, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"))
    category = relationship("CategoryModel", back_populates="items")


class JsonModel(Base):
    __tablename__ = "json_items"
    id = Column(Integer, primary_key=True)
    payload = Column(JSON, nullable=True)
    payload_b = Column(JSONB, nullable=True)


@pytest.fixture(autouse=True)
def setup_pool():
    # models_pool is a shared global (deepsel/apps/conftest.py registers the
    # real core+cms models into it once for the whole session) — save/restore
    # it rather than resetting to {}, or every test running later in the same
    # session loses those real registrations.
    old_pool = dict(models_pool)
    set_models_pool(
        {
            "categories": CategoryModel,
            "items": ItemModel,
        }
    )
    yield
    set_models_pool(old_pool)


def test_generate_create_schema_excludes_technical_fields():
    schema = generate_create_schema(ItemModel)
    fields = schema.model_fields
    assert "id" not in fields
    assert "created_at" not in fields
    assert "updated_at" not in fields
    assert "owner_id" not in fields
    assert "title" in fields
    assert "description" in fields


def test_generate_create_schema_includes_foreign_key():
    schema = generate_create_schema(ItemModel)
    fields = schema.model_fields
    assert "category_id" in fields


def test_generate_read_schema_includes_all_non_secret_fields():
    schema = generate_read_schema(ItemModel)
    fields = schema.model_fields
    assert "id" in fields
    assert "title" in fields
    assert "description" in fields
    assert "created_at" in fields


def test_generate_read_schema_includes_relationships():
    schema = generate_read_schema(ItemModel)
    fields = schema.model_fields
    assert "category" in fields


def test_generate_read_schema_one2many():
    schema = generate_read_schema(CategoryModel)
    fields = schema.model_fields
    assert "items" in fields


def test_generate_update_schema_excludes_id_and_technical():
    schema = generate_update_schema(ItemModel)
    fields = schema.model_fields
    assert "id" not in fields
    assert "owner_id" not in fields
    assert "created_at" not in fields
    assert "updated_at" not in fields
    assert "title" in fields
    assert "description" in fields


def test_generate_search_schema_has_total_and_data():
    schema = generate_search_schema(ItemModel)
    fields = schema.model_fields
    assert "total" in fields
    assert "data" in fields


def test_generate_search_schema_with_custom_read():
    read_schema = generate_read_schema(ItemModel)
    schema = generate_search_schema(ItemModel, read_schema=read_schema)
    fields = schema.model_fields
    assert "total" in fields
    assert "data" in fields


def test_generate_CRUD_schemas_returns_all():
    result = generate_CRUD_schemas("items")
    assert result.Create is not None
    assert result.Read is not None
    assert result.Update is not None
    assert result.Search is not None


def test_generate_CRUD_schemas_category():
    result = generate_CRUD_schemas("categories")
    assert result.Create is not None
    assert "name" in result.Create.model_fields


@pytest.mark.parametrize("field", ["payload", "payload_b"])
def test_json_and_jsonb_columns_accept_lists(field):
    """JSONB's python_type is `dict` only — an array-holding column would 422 on
    write and fail response validation on read if it weren't special-cased."""
    create_schema = generate_create_schema(JsonModel)
    read_schema = generate_read_schema(JsonModel)

    values = {"payload": [{"src": "a.png"}], "payload_b": [{"src": "b.png"}]}
    created = create_schema(**values)
    assert getattr(created, field) == values[field]

    read = read_schema(id=1, **values)
    assert getattr(read, field) == values[field]


@pytest.mark.parametrize("field", ["payload", "payload_b"])
def test_json_and_jsonb_columns_accept_dicts(field):
    create_schema = generate_create_schema(JsonModel)
    values = {"payload": {"src": "a.png"}, "payload_b": {"src": "b.png"}}
    created = create_schema(**values)
    assert getattr(created, field) == values[field]
