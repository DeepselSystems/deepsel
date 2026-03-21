import pytest
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

from deepsel.utils.get_class_info import get_class_info, ClassInfo
from deepsel.utils.models_pool import set_models_pool

Base = declarative_base()


class AuthorModel(Base):
    __tablename__ = "authors"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    books = relationship("BookModel", back_populates="author")


class BookModel(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True)
    title = Column(String(200))
    author_id = Column(Integer, ForeignKey("authors.id"))
    author = relationship("AuthorModel", back_populates="books")


class IsolatedModel(Base):
    __tablename__ = "isolated"
    id = Column(Integer, primary_key=True)
    value = Column(String(50))


@pytest.fixture(autouse=True)
def setup_pool():
    set_models_pool(
        {
            "authors": AuthorModel,
            "books": BookModel,
            "isolated": IsolatedModel,
        }
    )
    yield
    set_models_pool({})


def test_returns_class_info():
    result = get_class_info(AuthorModel)
    assert isinstance(result, ClassInfo)


def test_basic_class_info():
    result = get_class_info(AuthorModel)
    assert result.name == "AuthorModel"
    assert result.table_name == "authors"


def test_fields_populated():
    result = get_class_info(AuthorModel)
    assert "id" in result.fields
    assert "name" in result.fields


def test_relationships_populated():
    result = get_class_info(AuthorModel)
    assert result.relationships is not None
    assert len(result.relationships.one2many) == 1
    assert result.relationships.one2many[0].name == "books"


def test_include_fields_false():
    result = get_class_info(AuthorModel, include_fields=False)
    assert result.fields == {}


def test_include_relationships_false():
    result = get_class_info(AuthorModel, include_relationships=False)
    assert result.relationships is None


def test_exclude_fields():
    result = get_class_info(AuthorModel, exclude_fields=["name"])
    assert "name" not in result.fields
    assert "id" in result.fields


def test_circular_reference_no_infinite_recursion():
    """Models that reference each other should not cause infinite recursion."""
    result = get_class_info(AuthorModel)
    # Should complete without error
    assert result.name == "AuthorModel"
    # The one2many relationship should have related_class_info
    book_info = result.relationships.one2many[0].related_class_info
    assert book_info is not None
    assert book_info.name == "BookModel"


def test_foreign_key_has_related_class_info():
    result = get_class_info(BookModel)
    author_id_field = result.fields["author_id"]
    assert author_id_field.is_foreign_key is True
    assert author_id_field.related_class_info is not None
    assert author_id_field.related_class_info.name == "AuthorModel"


def test_isolated_model():
    result = get_class_info(IsolatedModel)
    assert result.name == "IsolatedModel"
    assert result.relationships.one2many == []
    assert result.relationships.many2one == []
    assert result.relationships.many2many == []
