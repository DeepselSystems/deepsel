from unittest.mock import MagicMock

import pytest

# import deepsel.utils first to avoid circular-import quirk during collection
from deepsel.utils.models_pool import models_pool  # noqa: F401

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base, relationship

from deepsel.orm.activity_mixin import ActivityMixin

Base = declarative_base()


class Role(Base):
    __tablename__ = "activity_test_role"
    id = Column(Integer, primary_key=True)
    name = Column(String)


class Thing(Base, ActivityMixin):
    __tablename__ = "activity_test_thing"
    __tracked_fields__ = ["name", "active", "role:name"]

    id = Column(Integer, primary_key=True)
    name = Column(String)
    active = Column(Boolean)
    role_id = Column(Integer, ForeignKey("activity_test_role.id"))
    role = relationship("Role")


def _make_thing(**attrs):
    thing = Thing()
    for k, v in attrs.items():
        setattr(thing, k, v)
    return thing


class TestGetChanges:
    def test_detects_regular_field_change_with_type(self):
        thing = _make_thing(name="old", active=True)
        changes = thing._get_changes(MagicMock(), {"name": "new"})
        assert len(changes) == 1
        assert changes[0]["field"] == "name"
        assert changes[0]["old_value"] == "old"
        assert changes[0]["new_value"] == "new"
        assert changes[0]["type"] == "string"

    def test_boolean_field_type_mapping(self):
        thing = _make_thing(name="x", active=True)
        changes = thing._get_changes(MagicMock(), {"active": False})
        assert changes[0]["type"] == "boolean"

    def test_unchanged_value_not_reported(self):
        thing = _make_thing(name="same", active=True)
        changes = thing._get_changes(MagicMock(), {"name": "same"})
        assert changes == []

    def test_field_absent_from_values_skipped(self):
        thing = _make_thing(name="old", active=True)
        changes = thing._get_changes(MagicMock(), {"unrelated": 1})
        assert changes == []

    def test_relationship_change_detected(self):
        thing = _make_thing(name="x", active=True, role=Role(name="Admin"))
        db = MagicMock()
        db.query.return_value.get.return_value = Role(name="User")
        changes = thing._get_changes(db, {"role": 5})
        rel_change = [c for c in changes if c["field"] == "role"]
        assert len(rel_change) == 1
        assert rel_change[0]["old_value"] == "Admin"
        assert rel_change[0]["new_value"] == "User"
        assert rel_change[0]["type"] == "relationship"
        assert rel_change[0]["display_field"] == "name"

    def test_relationship_unchanged_not_reported(self):
        thing = _make_thing(name="x", active=True, role=Role(name="Admin"))
        db = MagicMock()
        db.query.return_value.get.return_value = Role(name="Admin")
        changes = thing._get_changes(db, {"role": 5})
        assert [c for c in changes if c["field"] == "role"] == []

    def test_multiple_changes_reported_together(self):
        thing = _make_thing(name="old", active=True, role=Role(name="Admin"))
        db = MagicMock()
        db.query.return_value.get.return_value = Role(name="User")
        changes = thing._get_changes(db, {"name": "new", "active": False, "role": 5})
        fields = {c["field"] for c in changes}
        assert fields == {"name", "active", "role"}
