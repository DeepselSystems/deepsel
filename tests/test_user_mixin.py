"""Tests for role/permission resolution in deepsel.orm.user_mixin.UserMixin.

Covers:
- get_user_permissions: JSON parsing, multi-role union, implied-role
  contribution (single + multi-level), cycle safety, empty/None permissions.
- get_user_roles: transitive role set, cycle safety.
- is_admin: direct and implied admin roles.
- get_user_has_roles: classmethod DB query for users holding a role directly
  or via an implied-role mapping.
"""

import json

# NOTE: import deepsel.utils first to avoid a circular-import error during
# isolated collection (known package import-order quirk).
from deepsel.utils.models_pool import models_pool

from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    Table,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship

from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.user_mixin import UserMixin

# ---------------------------------------------------------------------------
# Test models
# ---------------------------------------------------------------------------

Base = declarative_base()


# Self-referential M2M association on Role for implied roles.
# Columns named to match get_user_has_roles: role_id, implied_role_id.
implied_role_table = Table(
    "implied_role",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("role.id"), primary_key=True),
    Column("implied_role_id", Integer, ForeignKey("role.id"), primary_key=True),
)


# User <-> Role association. Columns named user_id, role_id to match the
# UserRoleModel query in get_user_has_roles.
user_role_table = Table(
    "user_role",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("user.id"), primary_key=True),
    Column("role_id", Integer, ForeignKey("role.id"), primary_key=True),
)


class RoleModel(Base, ORMBaseMixin):
    __tablename__ = "role"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    permissions = Column(String, nullable=True)  # JSON string list

    implied_roles = relationship(
        "RoleModel",
        secondary="implied_role",
        primaryjoin="RoleModel.id == implied_role.c.role_id",
        secondaryjoin="RoleModel.id == implied_role.c.implied_role_id",
        backref="implied_by",
    )


class UserModel(Base, ORMBaseMixin, UserMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))

    roles = relationship("RoleModel", secondary="user_role")


# A bare ORM class exposing the implied_role association table so the
# get_user_has_roles query (which expects an object with row_id/implied_role_id
# columns) can run db.query(models_pool["implied_role"]).
class ImpliedRoleModel(Base):
    __table__ = implied_role_table


class UserRoleModel(Base):
    __table__ = user_role_table


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

import pytest  # noqa: E402


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
    old_pool = dict(models_pool)
    models_pool["user"] = UserModel
    models_pool["role"] = RoleModel
    models_pool["implied_role"] = ImpliedRoleModel
    models_pool["user_role"] = UserRoleModel
    yield session
    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _role(db, name, permissions=None, string_id=None, implied=None):
    role = RoleModel(
        name=name,
        string_id=string_id,
        permissions=json.dumps(permissions) if permissions is not None else None,
    )
    if implied:
        role.implied_roles.extend(implied)
    db.add(role)
    db.flush()
    return role


def _user(db, name, roles=None):
    user = UserModel(name=name)
    if roles:
        user.roles.extend(roles)
    db.add(user)
    db.flush()
    return user


# ---------------------------------------------------------------------------
# get_user_permissions
# ---------------------------------------------------------------------------


class TestGetUserPermissions:
    def test_single_role_permissions_parsed(self, db):
        role = _role(db, "Reader", permissions=["item:read:*", "item:write:own"])
        user = _user(db, "u1", roles=[role])
        perms = user.get_user_permissions()
        assert set(perms) == {"item:read:*", "item:write:own"}

    def test_multiple_roles_union_deduped(self, db):
        r1 = _role(db, "R1", permissions=["item:read:*", "shared:read:*"])
        r2 = _role(db, "R2", permissions=["item:write:*", "shared:read:*"])
        user = _user(db, "u2", roles=[r1, r2])
        perms = user.get_user_permissions()
        # union, de-duplicated (shared:read:* appears once)
        assert sorted(perms) == sorted({"item:read:*", "shared:read:*", "item:write:*"})
        assert len(perms) == 3

    def test_implied_role_contributes_permissions_one_level(self, db):
        base = _role(db, "Base", permissions=["base:read:*"])
        role = _role(db, "Composite", permissions=["item:read:*"], implied=[base])
        user = _user(db, "u3", roles=[role])
        perms = user.get_user_permissions()
        assert set(perms) == {"item:read:*", "base:read:*"}

    def test_implied_role_multi_level_transitive(self, db):
        leaf = _role(db, "Leaf", permissions=["leaf:read:*"])
        mid = _role(db, "Mid", permissions=["mid:read:*"], implied=[leaf])
        top = _role(db, "Top", permissions=["top:read:*"], implied=[mid])
        user = _user(db, "u4", roles=[top])
        perms = user.get_user_permissions()
        assert set(perms) == {"top:read:*", "mid:read:*", "leaf:read:*"}

    def test_cyclic_implied_roles_terminate(self, db):
        a = _role(db, "A", permissions=["a:read:*"])
        b = _role(db, "B", permissions=["b:read:*"])
        a.implied_roles.append(b)
        b.implied_roles.append(a)  # cycle A -> B -> A
        db.flush()
        user = _user(db, "u5", roles=[a])
        perms = user.get_user_permissions()
        assert set(perms) == {"a:read:*", "b:read:*"}

    def test_role_with_none_permissions(self, db):
        role = _role(db, "Empty", permissions=None)
        user = _user(db, "u6", roles=[role])
        assert user.get_user_permissions() == []

    def test_role_with_empty_permissions(self, db):
        role = _role(db, "EmptyList", permissions=[])
        user = _user(db, "u7", roles=[role])
        assert user.get_user_permissions() == []

    def test_none_permission_role_with_implied_still_contributes(self, db):
        child = _role(db, "Child", permissions=["child:read:*"])
        parent = _role(db, "ParentNone", permissions=None, implied=[child])
        user = _user(db, "u8", roles=[parent])
        assert set(user.get_user_permissions()) == {"child:read:*"}

    def test_explicit_user_argument(self, db):
        role = _role(db, "Arg", permissions=["arg:read:*"])
        target = _user(db, "target", roles=[role])
        caller = _user(db, "caller", roles=[])
        # Passing user explicitly resolves the target's permissions.
        assert set(caller.get_user_permissions(user=target)) == {"arg:read:*"}


# ---------------------------------------------------------------------------
# get_user_roles
# ---------------------------------------------------------------------------


class TestGetUserRoles:
    def test_transitive_role_set(self, db):
        leaf = _role(db, "RLeaf")
        mid = _role(db, "RMid", implied=[leaf])
        top = _role(db, "RTop", implied=[mid])
        user = _user(db, "ur1", roles=[top])
        roles = user.get_user_roles()
        names = {r.name for r in roles}
        assert names == {"RTop", "RMid", "RLeaf"}

    def test_cycle_safe(self, db):
        a = _role(db, "CA")
        b = _role(db, "CB")
        a.implied_roles.append(b)
        b.implied_roles.append(a)
        db.flush()
        user = _user(db, "ur2", roles=[a])
        roles = user.get_user_roles()
        names = {r.name for r in roles}
        assert names == {"CA", "CB"}

    def test_multiple_direct_roles(self, db):
        r1 = _role(db, "D1")
        r2 = _role(db, "D2")
        user = _user(db, "ur3", roles=[r1, r2])
        roles = user.get_user_roles()
        assert {r.name for r in roles} == {"D1", "D2"}


# ---------------------------------------------------------------------------
# is_admin
# ---------------------------------------------------------------------------


class TestIsAdmin:
    def test_direct_admin_role(self, db):
        role = _role(db, "Admin", string_id="admin_role")
        user = _user(db, "adm1", roles=[role])
        assert user.is_admin() is True

    def test_direct_super_admin_role(self, db):
        role = _role(db, "SuperAdmin", string_id="super_admin_role")
        user = _user(db, "adm2", roles=[role])
        assert user.is_admin() is True

    def test_implied_admin_role(self, db):
        admin = _role(db, "AdminImplied", string_id="admin_role")
        wrapper = _role(db, "Wrapper", string_id="wrapper_role", implied=[admin])
        user = _user(db, "adm3", roles=[wrapper])
        assert user.is_admin() is True

    def test_non_admin(self, db):
        role = _role(db, "Plain", string_id="plain_role")
        user = _user(db, "adm4", roles=[role])
        assert user.is_admin() is False

    def test_no_roles(self, db):
        user = _user(db, "adm5", roles=[])
        assert user.is_admin() is False


# ---------------------------------------------------------------------------
# get_user_has_roles (classmethod, real DB)
# ---------------------------------------------------------------------------


class TestGetUserHasRoles:
    def test_direct_role_holder(self, db):
        target_role = _role(db, "Target", string_id="target_role")
        other_role = _role(db, "Other", string_id="other_role")
        holder = _user(db, "holder", roles=[target_role])
        _user(db, "nonholder", roles=[other_role])
        db.flush()

        users = UserModel.get_user_has_roles(["target_role"], db)
        ids = {u.id for u in users}
        assert holder.id in ids
        assert len(ids) == 1

    def test_via_implied_role_mapping(self, db):
        # base_role is implied by wrapper_role. A user holding wrapper_role
        # (directly) must be returned when querying for base_role.
        base_role = _role(db, "Base", string_id="base_role")
        wrapper_role = _role(
            db, "Wrapper", string_id="wrapper_role", implied=[base_role]
        )
        db.flush()

        implied_holder = _user(db, "implied_holder", roles=[wrapper_role])
        direct_holder = _user(db, "direct_holder", roles=[base_role])
        unrelated = _role(db, "Unrelated", string_id="unrelated_role")
        _user(db, "unrelated_user", roles=[unrelated])
        db.flush()

        users = UserModel.get_user_has_roles(["base_role"], db)
        ids = {u.id for u in users}
        # both the direct holder and the implied (wrapper) holder are returned
        assert direct_holder.id in ids
        assert implied_holder.id in ids
        assert len(ids) == 2

    def test_no_holders_returns_empty(self, db):
        _role(db, "Lonely", string_id="lonely_role")
        db.flush()
        users = UserModel.get_user_has_roles(["lonely_role"], db)
        assert users == []

    def test_multiple_role_string_ids(self, db):
        ra = _role(db, "RoleA", string_id="role_a")
        rb = _role(db, "RoleB", string_id="role_b")
        ua = _user(db, "ua", roles=[ra])
        ub = _user(db, "ub", roles=[rb])
        db.flush()

        users = UserModel.get_user_has_roles(["role_a", "role_b"], db)
        ids = {u.id for u in users}
        assert ua.id in ids
        assert ub.id in ids
