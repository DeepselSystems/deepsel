import pytest
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, relationship

from deepsel.utils.generate_crud_schemas import (
    generate_create_schema,
    generate_read_schema,
    generate_update_schema,
    generate_search_schema,
    generate_CRUD_schemas,
)
from deepsel.utils.models_pool import set_models_pool

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


@pytest.fixture(autouse=True)
def setup_pool():
    set_models_pool(
        {
            "categories": CategoryModel,
            "items": ItemModel,
        }
    )
    yield
    set_models_pool({})


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
