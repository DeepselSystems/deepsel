import enum
from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Table,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from deepsel.orm.mixin import ORMBaseMixin, _get_relationships_class_map
from deepsel.orm.types import (
    PermissionAction,
    PermissionScope,
    SearchQuery,
    SearchCriteria,
    Operator,
    OrderByCriteria,
    OrderDirection,
)
from deepsel.utils.models_pool import models_pool

# ---------------------------------------------------------------------------
# Test models & helpers
# ---------------------------------------------------------------------------

Base = declarative_base()


class StatusEnum(enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class ItemModel(Base, ORMBaseMixin):
    __tablename__ = "item"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    title = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    quantity = Column(Integer, nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.ACTIVE)


class ParentModel(Base, ORMBaseMixin):
    __tablename__ = "parent"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    children = relationship("ChildModel", back_populates="parent_rel")


class ChildModel(Base, ORMBaseMixin):
    __tablename__ = "child"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    parent_id = Column(Integer, ForeignKey("parent.id"), nullable=True)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    parent_rel = relationship("ParentModel", back_populates="children")


item_tag_table = Table(
    "item_tag",
    Base.metadata,
    Column("item_id", Integer, ForeignKey("taggeditem.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tag.id"), primary_key=True),
)


class TaggedItemModel(Base, ORMBaseMixin):
    __tablename__ = "taggeditem"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    tags = relationship("TagModel", secondary="item_tag", back_populates="items")


class TagModel(Base, ORMBaseMixin):
    __tablename__ = "tag"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    items = relationship("TaggedItemModel", secondary="item_tag", back_populates="tags")


class MockUser:
    def __init__(
        self,
        id=1,
        organization_id=1,
        permissions=None,
        org_ids=None,
    ):
        self.id = id
        self.organization_id = organization_id
        self._permissions = permissions or []
        self._org_ids = org_ids or ([organization_id] if organization_id else [])

    def get_user_permissions(self):
        return self._permissions

    def get_org_ids(self):
        return self._org_ids


def _admin_user(user_id=1, org_id=1):
    """User with full permissions on item table."""
    return MockUser(
        id=user_id,
        organization_id=org_id,
        permissions=[
            "item:*:*",
            "parent:*:*",
            "child:*:*",
            "taggeditem:*:*",
            "tag:*:*",
        ],
    )


def _readonly_user(user_id=2, org_id=1, scope="*"):
    return MockUser(
        id=user_id,
        organization_id=org_id,
        permissions=[f"item:read:{scope}"],
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    # Populate models_pool for the duration of the test
    old_pool = dict(models_pool)
    models_pool["item"] = ItemModel
    models_pool["parent"] = ParentModel
    models_pool["child"] = ChildModel
    models_pool["taggeditem"] = TaggedItemModel
    models_pool["tag"] = TagModel
    yield session
    session.close()
    transaction.rollback()
    connection.close()
    # Restore models_pool
    models_pool.clear()
    models_pool.update(old_pool)


# ---------------------------------------------------------------------------
# __repr__ / __str__ / to_dict / serialize / get_class
# ---------------------------------------------------------------------------


class TestBasicModelBehavior:
    def test_repr_with_name(self, db):
        item = ItemModel(id=1, name="Widget")
        assert "Item" in repr(item)
        assert "Widget" in repr(item)

    def test_repr_with_title_fallback(self, db):
        item = ItemModel(id=2, title="My Title")
        assert "My Title" in repr(item)

    def test_repr_no_identifier(self, db):
        item = ItemModel(id=3)
        assert "Item" in repr(item)

    def test_str_delegates_to_repr(self, db):
        item = ItemModel(id=1, name="X")
        assert str(item) == repr(item)

    def test_to_dict(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "TD"}, commit=False)
        d = item.to_dict()
        assert d["name"] == "TD"
        assert "id" in d

    def test_serialize_converts_enum(self, db):
        item = ItemModel(id=1, status=StatusEnum.ACTIVE)
        s = item.serialize()
        assert s["status"] == "active"
        assert "_sa_instance_state" not in s

    def test_get_class(self):
        assert ItemModel.get_class() is ItemModel


# ---------------------------------------------------------------------------
# _get_relationships_class_map
# ---------------------------------------------------------------------------


class TestGetRelationshipsClassMap:
    def test_returns_relationship_classes(self, db):
        m = _get_relationships_class_map(ParentModel)
        assert "children" in m
        assert m["children"] is ChildModel


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------


class TestFilterPermission:
    def test_matches_table(self):
        assert ItemModel._filter_permission("item:read:*") is True

    def test_no_match(self):
        assert ItemModel._filter_permission("other:read:*") is False


class TestFilterAction:
    def test_matches_exact_action(self):
        assert ItemModel._filter_action("item:read:*", PermissionAction.read) is True

    def test_wildcard_action(self):
        assert ItemModel._filter_action("item:*:*", PermissionAction.read) is True

    def test_no_match(self):
        assert ItemModel._filter_action("item:write:*", PermissionAction.read) is False


class TestCheckHasPermission:
    def test_allowed_all_scope(self):
        user = MockUser(permissions=["item:read:*"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is True
        assert scope == PermissionScope.all

    def test_allowed_org_scope(self):
        user = MockUser(permissions=["item:read:org"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is True
        assert scope == PermissionScope.org

    def test_allowed_own_scope(self):
        user = MockUser(permissions=["item:read:own"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is True
        assert scope == PermissionScope.own

    def test_allowed_own_org_scope(self):
        user = MockUser(permissions=["item:read:own_org"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is True
        assert scope == PermissionScope.own_org

    def test_highest_scope_wins(self):
        user = MockUser(permissions=["item:read:own", "item:read:*"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert scope == PermissionScope.all

    def test_no_table_permission(self):
        user = MockUser(permissions=["other:read:*"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is False
        assert scope == PermissionScope.none

    def test_no_action_permission(self):
        user = MockUser(permissions=["item:write:*"])
        allowed, scope = ItemModel._check_has_permission(PermissionAction.read, user)
        assert allowed is False
        assert scope == PermissionScope.none


# ---------------------------------------------------------------------------
# _can_process_with_scope
# ---------------------------------------------------------------------------


class TestCanProcessWithScope:
    def test_scope_all(self, db):
        item = ItemModel(id=1, owner_id=99, organization_id=99)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.all, user) is True

    def test_scope_own_owner_match(self, db):
        item = ItemModel(id=1, owner_id=1)
        user = MockUser(id=1)
        assert item._can_process_with_scope(PermissionScope.own, user) is True

    def test_scope_own_owner_no_match(self, db):
        item = ItemModel(id=1, owner_id=99)
        user = MockUser(id=1)
        assert item._can_process_with_scope(PermissionScope.own, user) is False

    def test_scope_org_match(self, db):
        item = ItemModel(id=1, organization_id=1)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.org, user) is True

    def test_scope_org_no_match(self, db):
        item = ItemModel(id=1, organization_id=99)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.org, user) is False

    def test_scope_own_org_owner_match(self, db):
        item = ItemModel(id=1, owner_id=1, organization_id=99)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.own_org, user) is True

    def test_scope_own_org_org_match(self, db):
        item = ItemModel(id=1, owner_id=99, organization_id=1)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.own_org, user) is True

    def test_scope_own_org_no_match(self, db):
        item = ItemModel(id=1, owner_id=99, organization_id=99)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.own_org, user) is False

    def test_scope_none_returns_false(self, db):
        item = ItemModel(id=1, owner_id=1, organization_id=1)
        user = MockUser(id=1, organization_id=1)
        assert item._can_process_with_scope(PermissionScope.none, user) is False


# ---------------------------------------------------------------------------
# CRUD: create
# ---------------------------------------------------------------------------


class TestCreate:
    def test_basic_create(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "Test Item"}, commit=False)
        assert item.name == "Test Item"
        assert item.owner_id == user.id
        assert item.organization_id == user.organization_id

    def test_create_sets_owner_id(self, db):
        user = _admin_user(user_id=42)
        item = ItemModel.create(db, user, {"name": "Owned"}, commit=False)
        assert item.owner_id == 42

    def test_create_resolves_organization_id(self, db):
        user = _admin_user(org_id=5)
        item = ItemModel.create(db, user, {"name": "OrgTest"}, commit=False)
        assert item.organization_id == 5

    def test_create_permission_denied(self, db):
        user = MockUser(permissions=[])
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.create(db, user, {"name": "Nope"})
        assert exc_info.value.status_code == 403

    def test_create_bypass_permission(self, db):
        user = MockUser(permissions=[])
        item = ItemModel.create(
            db, user, {"name": "Bypass"}, commit=False, bypass_permission=True
        )
        assert item.name == "Bypass"

    def test_create_pops_unknown_fields(self, db):
        user = _admin_user()
        item = ItemModel.create(
            db, user, {"name": "X", "nonexistent_field": 123}, commit=False
        )
        assert item.name == "X"
        assert not hasattr(item, "nonexistent_field")

    def test_create_with_explicit_organization_id(self, db):
        user = _admin_user(org_id=1)
        item = ItemModel.create(
            db, user, {"name": "ExplicitOrg", "organization_id": 99}, commit=False
        )
        assert item.organization_id == 99

    def test_create_resolves_string_id_reference(self, db):
        """Test that values like 'item/some_string_id' resolve to the record's id."""
        user = _admin_user()
        # Create a parent with a known string_id
        parent = ParentModel.create(
            db, user, {"name": "RefParent", "string_id": "ref_parent_1"}, commit=False
        )
        db.flush()

        # Create a child using the string_id reference format
        child = ChildModel.create(
            db,
            user,
            {"name": "RefChild", "parent_id": f"parent/{parent.string_id}"},
            commit=False,
        )
        db.flush()
        assert child.parent_id == parent.id

    def test_create_unique_constraint_violation(self, db):
        """Duplicate string_id should raise 400."""
        user = _admin_user()
        ItemModel.create(
            db, user, {"name": "Unique1", "string_id": "dup_sid"}, commit=True
        )
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.create(
                db, user, {"name": "Unique2", "string_id": "dup_sid"}, commit=True
            )
        assert exc_info.value.status_code == 400

    def test_create_with_one2many_children(self, db):
        """Create parent with one2many children in a single call."""
        user = _admin_user()
        parent = ParentModel.create(
            db,
            user,
            {
                "name": "BatchParent",
                "children": [
                    {"name": "BatchChild1"},
                    {"name": "BatchChild2"},
                    {"name": "BatchChild3"},
                ],
            },
        )
        db.refresh(parent)
        assert len(parent.children) == 3


# ---------------------------------------------------------------------------
# CRUD: update
# ---------------------------------------------------------------------------


class TestUpdate:
    def _make_item(self, db, name="Updatable", user=None):
        user = user or _admin_user()
        item = ItemModel.create(db, user, {"name": name}, commit=False)
        db.flush()
        return item

    def test_basic_update(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        item.update(db, user, {"name": "Updated"}, commit=False)
        assert item.name == "Updated"

    def test_update_system_record_raises(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        item.system = True
        with pytest.raises(HTTPException) as exc_info:
            item.update(db, user, {"name": "Nope"})
        assert exc_info.value.status_code == 403
        assert "System records" in exc_info.value.detail

    def test_update_permission_denied(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        no_perm_user = MockUser(permissions=[])
        with pytest.raises(HTTPException) as exc_info:
            item.update(db, no_perm_user, {"name": "Nope"})
        assert exc_info.value.status_code == 403

    def test_update_bypass_permission(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        # bypass_permission only skips the `allowed` check but _can_process_with_scope
        # still runs. With no permissions scope=none → _can_process_with_scope returns False.
        # So bypass_permission still needs a user whose scope would pass.
        # Give the user write:* so scope=all and bypass works fully.
        write_user = MockUser(
            id=user.id,
            organization_id=1,
            permissions=["item:write:*"],
        )
        item.update(
            db, write_user, {"name": "Bypassed"}, commit=False, bypass_permission=True
        )
        assert item.name == "Bypassed"

    def test_update_scope_denied(self, db):
        """Update with scope=own but user is not the owner should raise 403."""
        admin = _admin_user()
        item = self._make_item(db, user=admin)
        item.owner_id = 999
        db.flush()
        own_user = MockUser(id=1, organization_id=1, permissions=["item:write:own"])
        with pytest.raises(HTTPException) as exc_info:
            item.update(db, own_user, {"name": "Nope"})
        assert exc_info.value.status_code == 403

    def test_update_unique_constraint_violation(self, db):
        """Updating to a duplicate string_id should raise 400."""
        user = _admin_user()
        item1 = ItemModel.create(
            db, user, {"name": "First", "string_id": "upd_dup_1"}, commit=True
        )
        item2 = ItemModel.create(
            db, user, {"name": "Second", "string_id": "upd_dup_2"}, commit=True
        )
        with pytest.raises(HTTPException) as exc_info:
            item2.update(db, user, {"string_id": "upd_dup_1"}, commit=True)
        assert exc_info.value.status_code == 400

    def test_update_one2many_nonexistent_id_creates_new(self, db):
        """Updating with a child that has a non-existent id should create a new record."""
        user = _admin_user()
        parent = ParentModel.create(
            db, user, {"name": "ParentNonExist", "children": [{"name": "C1"}]}
        )
        db.refresh(parent)
        # Pass a child with a bogus id — should be treated as new
        parent.update(
            db,
            user,
            {"children": [{"id": 999999, "name": "GhostChild"}]},
        )
        db.refresh(parent)
        child_names = {c.name for c in parent.children}
        assert "GhostChild" in child_names


# ---------------------------------------------------------------------------
# CRUD: delete
# ---------------------------------------------------------------------------


class TestDelete:
    def _make_item(self, db, user=None):
        user = user or _admin_user()
        item = ItemModel.create(db, user, {"name": "Deletable"}, commit=False)
        db.flush()
        return item

    def test_basic_delete(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        result = item.delete(db, user, force=True, commit=False)
        assert result["success"] is True

    def test_delete_system_record_raises(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        item.system = True
        with pytest.raises(HTTPException) as exc_info:
            item.delete(db, user)
        assert exc_info.value.status_code == 403

    def test_delete_permission_denied(self, db):
        user = _admin_user()
        item = self._make_item(db, user=user)
        no_perm_user = MockUser(permissions=[])
        with pytest.raises(HTTPException) as exc_info:
            item.delete(db, no_perm_user)
        assert exc_info.value.status_code == 403

    def test_delete_own_scope_owner_mismatch(self, db):
        user = MockUser(
            id=1,
            organization_id=1,
            permissions=["item:delete:own", "item:*:*"],
        )
        item = self._make_item(db, user=user)
        item.owner_id = 999
        # scope=own but owner doesn't match — should raise
        delete_user = MockUser(id=1, organization_id=1, permissions=["item:delete:own"])
        with pytest.raises(HTTPException) as exc_info:
            item.delete(db, delete_user, force=True)
        assert exc_info.value.status_code == 403

    def test_delete_org_scope_mismatch(self, db):
        admin = _admin_user()
        item = self._make_item(db, user=admin)
        item.organization_id = 99
        db.flush()
        org_user = MockUser(id=1, organization_id=1, permissions=["item:delete:org"])
        with pytest.raises(HTTPException) as exc_info:
            item.delete(db, org_user, force=True)
        assert exc_info.value.status_code == 403

    def test_delete_org_scope_match(self, db):
        """Delete with org scope where org matches should succeed."""
        admin = _admin_user()
        item = self._make_item(db, user=admin)
        item.organization_id = 1
        db.flush()
        org_user = MockUser(
            id=1, organization_id=1, permissions=["item:delete:org", "item:*:*"]
        )
        result = item.delete(db, org_user, force=True, commit=False)
        assert result["success"] is True


# ---------------------------------------------------------------------------
# CRUD: get_one / get_all
# ---------------------------------------------------------------------------


class TestGetOne:
    def test_get_one_basic(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "GetMe"}, commit=False)
        db.flush()
        fetched = ItemModel.get_one(db, user, item.id)
        assert fetched.name == "GetMe"

    def test_get_one_permission_denied(self, db):
        user = MockUser(permissions=[])
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.get_one(db, user, 1)
        assert exc_info.value.status_code == 403

    def test_get_one_own_scope(self, db):
        admin = _admin_user()
        item = ItemModel.create(db, admin, {"name": "OwnItem"}, commit=False)
        db.flush()
        own_user = MockUser(id=admin.id, permissions=["item:read:own"])
        fetched = ItemModel.get_one(db, own_user, item.id)
        assert fetched.name == "OwnItem"

    def test_get_one_org_scope(self, db):
        admin = _admin_user(org_id=5)
        item = ItemModel.create(
            db, admin, {"name": "OrgItem", "organization_id": 5}, commit=False
        )
        db.flush()
        org_user = MockUser(id=2, organization_id=5, permissions=["item:read:org"])
        fetched = ItemModel.get_one(db, org_user, item.id)
        assert fetched.name == "OrgItem"


class TestGetAll:
    def test_get_all_returns_active(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "A1"}, commit=False)
        ItemModel.create(db, user, {"name": "A2"}, commit=False)
        inactive = ItemModel.create(db, user, {"name": "Inactive"}, commit=False)
        inactive.active = False
        db.flush()

        results = ItemModel.get_all(db, user, {"skip": 0, "limit": 100})
        names = [r.name for r in results]
        assert "A1" in names
        assert "A2" in names
        assert "Inactive" not in names

    def test_get_all_permission_denied(self, db):
        user = MockUser(permissions=[])
        with pytest.raises(HTTPException):
            ItemModel.get_all(db, user, {"skip": 0, "limit": 10})

    def test_get_all_own_scope(self, db):
        admin = _admin_user(user_id=1)
        ItemModel.create(db, admin, {"name": "Mine"}, commit=False)
        other = _admin_user(user_id=2)
        ItemModel.create(db, other, {"name": "Theirs"}, commit=False)
        db.flush()

        own_user = MockUser(id=1, organization_id=1, permissions=["item:read:own"])
        results = ItemModel.get_all(db, own_user, {"skip": 0, "limit": 100})
        for r in results:
            assert r.owner_id == 1

    def test_get_all_org_scope(self, db):
        admin = _admin_user(user_id=1, org_id=10)
        ItemModel.create(
            db, admin, {"name": "SameOrg", "organization_id": 10}, commit=False
        )
        ItemModel.create(
            db, admin, {"name": "DiffOrg", "organization_id": 99}, commit=False
        )
        db.flush()

        org_user = MockUser(id=1, organization_id=10, permissions=["item:read:org"])
        results = ItemModel.get_all(db, org_user, {"skip": 0, "limit": 100})
        for r in results:
            assert r.organization_id == 10


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class TestSearch:
    def test_search_eq(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "FindMe"}, commit=False)
        ItemModel.create(db, user, {"name": "NotMe"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.eq, value="FindMe")]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "FindMe"

    def test_search_like(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "alpha_test"}, commit=False)
        ItemModel.create(db, user, {"name": "beta_test"}, commit=False)
        ItemModel.create(db, user, {"name": "gamma"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.like, value="test")]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 2

    def test_search_ilike(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "CaseTEST"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(field="name", operator=Operator.ilike, value="casetest")
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1

    def test_search_ne(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Keep"}, commit=False)
        ItemModel.create(db, user, {"name": "Exclude"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.ne, value="Exclude")]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        names = [r.name for r in result["data"]]
        assert "Exclude" not in names
        assert "Keep" in names

    def test_search_in(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "A"}, commit=False)
        ItemModel.create(db, user, {"name": "B"}, commit=False)
        ItemModel.create(db, user, {"name": "C"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.in_, value=["A", "C"])]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 2

    def test_search_not_in(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "X"}, commit=False)
        ItemModel.create(db, user, {"name": "Y"}, commit=False)
        ItemModel.create(db, user, {"name": "Z"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(field="name", operator=Operator.not_in, value=["X", "Y"])
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        names = [r.name for r in result["data"]]
        assert names == ["Z"]

    def test_search_or(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "OR1"}, commit=False)
        ItemModel.create(db, user, {"name": "OR2"}, commit=False)
        ItemModel.create(db, user, {"name": "OR3"}, commit=False)
        db.flush()

        search = SearchQuery(
            OR=[
                SearchCriteria(field="name", operator=Operator.eq, value="OR1"),
                SearchCriteria(field="name", operator=Operator.eq, value="OR3"),
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 2

    def test_search_pagination(self, db):
        user = _admin_user()
        for i in range(5):
            ItemModel.create(db, user, {"name": f"Page{i}"}, commit=False)
        db.flush()

        result = ItemModel.search(db, user, {"skip": 0, "limit": 2})
        assert result["total"] == 5
        assert len(result["data"]) == 2

    def test_search_nonexistent_field_raises(self, db):
        user = _admin_user()
        search = SearchQuery(
            AND=[SearchCriteria(field="nonexistent", operator=Operator.eq, value="x")]
        )
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.search(db, user, {"skip": 0, "limit": 10}, search=search)
        assert exc_info.value.status_code == 400

    def test_search_permission_denied(self, db):
        user = MockUser(permissions=[])
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.search(db, user, {"skip": 0, "limit": 10})
        assert exc_info.value.status_code == 403

    def test_search_with_order_by(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Bravo"}, commit=False)
        ItemModel.create(db, user, {"name": "Alpha"}, commit=False)
        ItemModel.create(db, user, {"name": "Charlie"}, commit=False)
        db.flush()

        order = OrderByCriteria(field="name", direction=OrderDirection.asc)
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, order_by=order)
        names = [r.name for r in result["data"]]
        assert names == sorted(names)

    def test_search_enum_field(self, db):
        user = _admin_user()
        ItemModel.create(
            db, user, {"name": "Active1", "status": StatusEnum.ACTIVE}, commit=False
        )
        ItemModel.create(
            db, user, {"name": "Inactive1", "status": StatusEnum.INACTIVE}, commit=False
        )
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="status", operator=Operator.eq, value="inactive")]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "Inactive1"

    def test_search_gt(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Low", "quantity": 5}, commit=False)
        ItemModel.create(db, user, {"name": "High", "quantity": 50}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="quantity", operator=Operator.gt, value=10)]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "High"

    def test_search_gte(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Exact", "quantity": 10}, commit=False)
        ItemModel.create(db, user, {"name": "Below", "quantity": 9}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="quantity", operator=Operator.gte, value=10)]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "Exact"

    def test_search_lt(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Small", "quantity": 3}, commit=False)
        ItemModel.create(db, user, {"name": "Big", "quantity": 100}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="quantity", operator=Operator.lt, value=50)]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "Small"

    def test_search_lte(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "AtLimit", "quantity": 20}, commit=False)
        ItemModel.create(db, user, {"name": "Over", "quantity": 21}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="quantity", operator=Operator.lte, value=20)]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "AtLimit"

    def test_search_between(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "InRange", "quantity": 15}, commit=False)
        ItemModel.create(db, user, {"name": "TooLow", "quantity": 1}, commit=False)
        ItemModel.create(db, user, {"name": "TooHigh", "quantity": 99}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(
                    field="quantity", operator=Operator.between, value=[10, 20]
                )
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "InRange"

    def test_search_contains(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "hello world"}, commit=False)
        ItemModel.create(db, user, {"name": "goodbye"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(field="name", operator=Operator.contains, value="world")
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "hello world"

    def test_search_order_by_desc(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "A"}, commit=False)
        ItemModel.create(db, user, {"name": "B"}, commit=False)
        ItemModel.create(db, user, {"name": "C"}, commit=False)
        db.flush()

        order = OrderByCriteria(field="name", direction=OrderDirection.desc)
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, order_by=order)
        names = [r.name for r in result["data"]]
        assert names == sorted(names, reverse=True)


# ---------------------------------------------------------------------------
# _build_query_based_on_scope
# ---------------------------------------------------------------------------


class TestBuildQueryBasedOnScope:
    def test_own_scope_filters_by_owner(self, db):
        user = _admin_user(user_id=1)
        ItemModel.create(db, user, {"name": "Mine"}, commit=False)
        other_user = _admin_user(user_id=2)
        ItemModel.create(db, other_user, {"name": "Theirs"}, commit=False)
        db.flush()

        query = db.query(ItemModel)
        scoped = ItemModel._build_query_based_on_scope(
            query, user, PermissionScope.own, ItemModel
        )
        results = scoped.all()
        for r in results:
            assert r.owner_id == 1

    def test_org_scope_filters_by_org(self, db):
        user = _admin_user(user_id=1, org_id=10)
        ItemModel.create(
            db, user, {"name": "SameOrg", "organization_id": 10}, commit=False
        )
        ItemModel.create(
            db, user, {"name": "DiffOrg", "organization_id": 99}, commit=False
        )
        db.flush()

        query = db.query(ItemModel)
        scoped = ItemModel._build_query_based_on_scope(
            query, user, PermissionScope.org, ItemModel
        )
        results = scoped.all()
        for r in results:
            assert r.organization_id == 10

    def test_all_scope_no_filter(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "Any1"}, commit=False)
        ItemModel.create(db, user, {"name": "Any2"}, commit=False)
        db.flush()

        query = db.query(ItemModel)
        scoped = ItemModel._build_query_based_on_scope(
            query, user, PermissionScope.all, ItemModel
        )
        assert scoped.count() >= 2


# ---------------------------------------------------------------------------
# CSV field/row conversion
# ---------------------------------------------------------------------------


class TestConvertCsvFieldValue:
    def test_empty_string_returns_none(self):
        col = Column(String)
        assert ItemModel._convert_csv_field_value("", col) is None

    def test_boolean_true_values(self):
        col = Column(Boolean)
        for val in ["true", "True", "1", "t", "y", "yes"]:
            assert ItemModel._convert_csv_field_value(val, col) is True

    def test_boolean_false_values(self):
        col = Column(Boolean)
        assert ItemModel._convert_csv_field_value("false", col) is False
        assert ItemModel._convert_csv_field_value("0", col) is False

    def test_integer(self):
        col = Column(Integer)
        assert ItemModel._convert_csv_field_value("42", col) == 42

    def test_datetime(self):
        col = Column(DateTime)
        result = ItemModel._convert_csv_field_value("2024-01-01T00:00:00", col)
        assert isinstance(result, datetime)

    def test_string_passthrough(self):
        col = Column(String)
        assert ItemModel._convert_csv_field_value("hello", col) == "hello"

    def test_enum_conversion(self):
        col = Column(Enum(StatusEnum))
        result = ItemModel._convert_csv_field_value("active", col)
        assert result == StatusEnum.ACTIVE


# ---------------------------------------------------------------------------
# bulk_delete
# ---------------------------------------------------------------------------


class TestBulkDelete:
    def test_bulk_delete_basic(self, db):
        user = _admin_user()
        ItemModel.create(db, user, {"name": "BD1"}, commit=False)
        ItemModel.create(db, user, {"name": "BD2"}, commit=False)
        ItemModel.create(db, user, {"name": "Keep"}, commit=False)
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.like, value="BD")]
        )
        result = ItemModel.bulk_delete(db, user, search=search, force=True)
        assert result.success is True
        assert result.deleted_count == 2

    def test_bulk_delete_permission_denied(self, db):
        user = MockUser(permissions=[])
        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.eq, value="x")]
        )
        with pytest.raises(HTTPException) as exc_info:
            ItemModel.bulk_delete(db, user, search=search)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# _resolve_organization_on_create hook
# ---------------------------------------------------------------------------


class TestResolveOrganizationOnCreate:
    def test_sets_org_from_user_when_missing(self, db):
        user = _admin_user(org_id=7)
        values = {"name": "OrgResolve"}
        result = ItemModel._resolve_organization_on_create(db, user, values)
        assert result["organization_id"] == 7

    def test_preserves_explicit_org(self, db):
        user = _admin_user(org_id=7)
        values = {"name": "OrgExplicit", "organization_id": 42}
        result = ItemModel._resolve_organization_on_create(db, user, values)
        assert result["organization_id"] == 42


# ---------------------------------------------------------------------------
# Parent/child relationships in create/update
# ---------------------------------------------------------------------------


class TestRelationshipCRUD:
    def test_create_parent_with_children(self, db):
        user = _admin_user()
        parent = ParentModel.create(
            db,
            user,
            {
                "name": "Parent1",
                "children": [{"name": "Child1"}, {"name": "Child2"}],
            },
        )
        db.refresh(parent)
        assert len(parent.children) == 2
        child_names = {c.name for c in parent.children}
        assert child_names == {"Child1", "Child2"}

    def test_update_add_child(self, db):
        user = _admin_user()
        parent = ParentModel.create(
            db,
            user,
            {"name": "Parent2", "children": [{"name": "ExistingChild"}]},
        )
        db.refresh(parent)
        existing_child_id = parent.children[0].id

        # Update: keep existing child, add new one
        parent.update(
            db,
            user,
            {
                "children": [
                    {"id": existing_child_id, "name": "ExistingChild"},
                    {"name": "NewChild"},
                ],
            },
        )
        db.refresh(parent)
        assert len(parent.children) == 2
        child_names = {c.name for c in parent.children}
        assert child_names == {"ExistingChild", "NewChild"}

    def test_update_remove_child(self, db):
        user = _admin_user()
        parent = ParentModel.create(
            db,
            user,
            {
                "name": "Parent3",
                "children": [{"name": "KeepMe"}, {"name": "RemoveMe"}],
            },
        )
        db.refresh(parent)
        keep_id = next(c.id for c in parent.children if c.name == "KeepMe")

        # Update: only keep one child — the other should be unlinked (nullable FK)
        parent.update(
            db,
            user,
            {"children": [{"id": keep_id, "name": "KeepMe"}]},
        )
        db.refresh(parent)
        assert len(parent.children) == 1
        assert parent.children[0].name == "KeepMe"

    def test_update_existing_child(self, db):
        user = _admin_user()
        parent = ParentModel.create(
            db,
            user,
            {"name": "Parent4", "children": [{"name": "OrigName"}]},
        )
        db.refresh(parent)
        child_id = parent.children[0].id

        # Update child's name via parent update
        parent.update(
            db,
            user,
            {"children": [{"id": child_id, "name": "RenamedChild"}]},
        )
        db.refresh(parent)
        assert parent.children[0].name == "RenamedChild"

    def test_create_with_many2many_tags(self, db):
        """Create a tagged item with many2many tags."""
        user = _admin_user()
        # Create tags first
        tag1 = TagModel.create(db, user, {"name": "TagA"})
        tag2 = TagModel.create(db, user, {"name": "TagB"})
        db.refresh(tag1)
        db.refresh(tag2)

        # Create item with tags
        item = TaggedItemModel.create(
            db,
            user,
            {
                "name": "TaggedItem1",
                "tags": [{"id": tag1.id}, {"id": tag2.id}],
            },
        )
        db.refresh(item)
        assert len(item.tags) == 2
        tag_names = {t.name for t in item.tags}
        assert tag_names == {"TagA", "TagB"}

    def test_update_many2many_tags(self, db):
        """Update many2many tags on an existing item."""
        user = _admin_user()
        tag1 = TagModel.create(db, user, {"name": "UpdTagA"})
        tag2 = TagModel.create(db, user, {"name": "UpdTagB"})
        tag3 = TagModel.create(db, user, {"name": "UpdTagC"})

        item = TaggedItemModel.create(
            db,
            user,
            {"name": "TaggedUpd", "tags": [{"id": tag1.id}]},
        )
        db.refresh(item)
        assert len(item.tags) == 1

        # Update: replace with tag2 and tag3
        item.update(
            db,
            user,
            {"tags": [{"id": tag2.id}, {"id": tag3.id}]},
        )
        db.refresh(item)
        assert len(item.tags) == 2
        tag_names = {t.name for t in item.tags}
        assert tag_names == {"UpdTagB", "UpdTagC"}

    def test_update_many2many_clear(self, db):
        """Clearing many2many by passing empty list."""
        user = _admin_user()
        tag1 = TagModel.create(db, user, {"name": "ClearTag"})

        item = TaggedItemModel.create(
            db,
            user,
            {"name": "ClearItem", "tags": [{"id": tag1.id}]},
        )
        db.refresh(item)
        assert len(item.tags) == 1

        # Clear all tags
        item.update(db, user, {"tags": []})
        db.refresh(item)
        assert len(item.tags) == 0


# ---------------------------------------------------------------------------
# _convert_csv_row
# ---------------------------------------------------------------------------


class TestConvertCsvRow:
    def test_converts_row(self, db):
        row = {"name": "TestRow", "quantity": "42", "active": "True"}
        result = ItemModel._convert_csv_row(row)
        assert result["name"] == "TestRow"
        assert result["quantity"] == 42

    def test_skips_missing_columns(self, db):
        row = {"name": "Only", "nonexistent": "value"}
        result = ItemModel._convert_csv_row(row)
        assert "name" in result
        assert "nonexistent" not in result


# ---------------------------------------------------------------------------
# Search: relationship field, datetime, enum list
# ---------------------------------------------------------------------------


class TestSearchAdvanced:
    def test_search_relationship_field(self, db):
        """Search on a relationship field like parent_rel.name."""
        user = _admin_user()
        parent = ParentModel.create(db, user, {"name": "SearchParent"})
        db.refresh(parent)
        ChildModel.create(db, user, {"name": "SearchChild", "parent_id": parent.id})
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(
                    field="parent_rel.name", operator=Operator.eq, value="SearchParent"
                )
            ]
        )
        result = ChildModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 1
        assert result["data"][0].name == "SearchChild"

    def test_search_enum_in_list(self, db):
        """Search with 'in' operator on enum field with list of values."""
        user = _admin_user()
        ItemModel.create(
            db, user, {"name": "EnumIn1", "status": StatusEnum.ACTIVE}, commit=False
        )
        ItemModel.create(
            db, user, {"name": "EnumIn2", "status": StatusEnum.INACTIVE}, commit=False
        )
        db.flush()

        search = SearchQuery(
            AND=[
                SearchCriteria(
                    field="status",
                    operator=Operator.in_,
                    value=["active", "inactive"],
                )
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert result["total"] == 2

    def test_search_active_filter_default(self, db):
        """When no 'active' condition is in search, only active records returned."""
        user = _admin_user()
        active = ItemModel.create(db, user, {"name": "ActiveItem"}, commit=False)
        inactive = ItemModel.create(db, user, {"name": "InactiveItem"}, commit=False)
        inactive.active = False
        db.flush()

        search = SearchQuery(
            AND=[SearchCriteria(field="name", operator=Operator.like, value="Item")]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        names = [r.name for r in result["data"]]
        assert "ActiveItem" in names
        assert "InactiveItem" not in names

    def test_search_active_explicit_skips_default_filter(self, db):
        """When 'active' is explicitly in search, the default active=True filter is skipped."""
        user = _admin_user()
        ItemModel.create(db, user, {"name": "ActExpl"}, commit=False)
        inactive = ItemModel.create(db, user, {"name": "InactExpl"}, commit=False)
        inactive.active = False
        db.flush()

        # Search with active=True explicitly — should still return active records
        # and NOT double-apply the active=True filter
        search = SearchQuery(
            AND=[
                SearchCriteria(field="active", operator=Operator.eq, value=True),
                SearchCriteria(field="name", operator=Operator.like, value="Expl"),
            ]
        )
        result = ItemModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        names = [r.name for r in result["data"]]
        assert "ActExpl" in names
        assert "InactExpl" not in names

    def test_search_nonexistent_relationship(self, db):
        """Searching on a non-existent relationship should raise 400."""
        user = _admin_user()
        search = SearchQuery(
            AND=[SearchCriteria(field="fake_rel.name", operator=Operator.eq, value="x")]
        )
        with pytest.raises(HTTPException) as exc_info:
            ChildModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert exc_info.value.status_code == 400

    def test_search_nonexistent_relationship_field(self, db):
        """Searching on a valid relationship but non-existent field should raise 400."""
        user = _admin_user()
        search = SearchQuery(
            AND=[
                SearchCriteria(
                    field="parent_rel.nonexistent", operator=Operator.eq, value="x"
                )
            ]
        )
        with pytest.raises(HTTPException) as exc_info:
            ChildModel.search(db, user, {"skip": 0, "limit": 100}, search=search)
        assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# _install_update_existing_record
# ---------------------------------------------------------------------------


class TestInstallUpdateExistingRecord:
    def test_force_update(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "Original"}, commit=False)
        db.flush()
        item._install_update_existing_record(
            {"name": "ForcedNew"}, db, force_update=True
        )
        assert item.name == "ForcedNew"

    def test_system_record_update(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "SysOrig"}, commit=False)
        item.system = True
        db.flush()
        item._install_update_existing_record({"name": "SysUpdated"}, db)
        assert item.name == "SysUpdated"

    def test_no_update_without_force_or_system(self, db):
        user = _admin_user()
        item = ItemModel.create(db, user, {"name": "NoChange"}, commit=False)
        db.flush()
        item._install_update_existing_record({"name": "Attempted"}, db)
        assert item.name == "NoChange"
