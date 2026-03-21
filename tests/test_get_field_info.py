import enum

from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base

from deepsel.utils.get_field_info import get_field_info, FieldInfo

Base = declarative_base()


class StatusEnum(enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class FakeOrganization(Base):
    __tablename__ = "organizations"
    id = Column(Integer, primary_key=True)
    name = Column(String(100))


class FakeUser(Base):
    __tablename__ = "fake_users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=False)
    status = Column(Enum(StatusEnum))
    is_active = Column(Boolean, default=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))


def test_returns_field_info_instance():
    result = get_field_info(FakeUser.__table__.c.name)
    assert isinstance(result, FieldInfo)


def test_basic_field_info():
    result = get_field_info(FakeUser.__table__.c.name)
    assert result.name == "name"
    assert result.camel_name == "name"
    assert result.pascal_name == "Name"
    assert result.human_name == "Name"
    assert result.is_foreign_key is False


def test_required_field():
    result = get_field_info(FakeUser.__table__.c.email)
    assert result.required is True


def test_nullable_field():
    result = get_field_info(FakeUser.__table__.c.name)
    assert result.required is False


def test_foreign_key_field():
    result = get_field_info(FakeUser.__table__.c.organization_id)
    assert result.is_foreign_key is True
    assert result.related_table == "organizations"
    assert result.related_human_name == "Organizations"


def test_enum_field():
    result = get_field_info(FakeUser.__table__.c.status)
    assert result.type == "ENUM"
    assert result.enum_values == ["active", "inactive"]


def test_field_with_default():
    result = get_field_info(FakeUser.__table__.c.is_active)
    assert result.default == "true"


def test_type_string():
    result = get_field_info(FakeUser.__table__.c.email)
    assert "VARCHAR" in result.type


def test_camel_name_multi_word():
    result = get_field_info(FakeUser.__table__.c.organization_id)
    assert result.camel_name == "organizationId"
    assert result.pascal_name == "OrganizationId"
    assert result.human_name == "Organization Id"
