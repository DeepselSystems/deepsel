import pytest
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import declarative_base, relationship

from deepsel.utils.get_relationships import (
    get_relationships,
    get_one2many_parent_id,
    RelationshipInfoResult,
)
from deepsel.utils.models_pool import set_models_pool

Base = declarative_base()


class ParentModel(Base):
    __tablename__ = "parents"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    children = relationship("ChildModel", back_populates="parent")


class ChildModel(Base):
    __tablename__ = "children"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
    parent_id = Column(Integer, ForeignKey("parents.id"))
    parent = relationship("ParentModel", back_populates="children")


class StandaloneModel(Base):
    __tablename__ = "standalones"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))


@pytest.fixture(autouse=True)
def setup_pool():
    set_models_pool(
        {
            "parents": ParentModel,
            "children": ChildModel,
            "standalones": StandaloneModel,
        }
    )
    yield
    set_models_pool({})


def test_returns_relationship_info_result():
    result = get_relationships(ParentModel)
    assert isinstance(result, RelationshipInfoResult)


def test_one2many_relationship():
    result = get_relationships(ParentModel)
    assert len(result.one2many) == 1
    rel = result.one2many[0]
    assert rel.name == "children"
    assert rel.type == "one2many"
    assert rel.table_name == "children"
    assert rel.class_name == "ChildModel"
    assert rel.back_populates == "parent"


def test_many2one_relationship():
    result = get_relationships(ChildModel)
    assert len(result.many2one) == 1
    rel = result.many2one[0]
    assert rel.name == "parent"
    assert rel.type == "many2one"
    assert rel.table_name == "parents"
    assert rel.class_name == "ParentModel"


def test_many2one_has_foreign_key_field():
    result = get_relationships(ChildModel)
    rel = result.many2one[0]
    assert rel.foreign_key_field is not None
    assert rel.foreign_key_field.name == "parent_id"
    assert rel.foreign_key_field.is_foreign_key is True


def test_relationship_camel_names():
    result = get_relationships(ParentModel)
    rel = result.one2many[0]
    assert rel.camel_name == "children"
    assert rel.human_name == "Children"


def test_no_relationships():
    result = get_relationships(StandaloneModel)
    assert result.one2many == []
    assert result.many2one == []
    assert result.many2many == []


def test_get_one2many_parent_id():
    field_info = get_one2many_parent_id(ChildModel, "parents")
    assert field_info is not None
    assert field_info.name == "parent_id"
    assert field_info.related_table == "parents"


def test_get_one2many_parent_id_not_found():
    field_info = get_one2many_parent_id(StandaloneModel, "parents")
    assert field_info is None
