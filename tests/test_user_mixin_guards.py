"""Tests for the UserMixin guards added alongside the starter e2e pass.

Covers:
- SB-6 / HB-1 / HB-2: `_resolve_email_template` picks the caller's org copy of a
  template instead of an arbitrary `.first()` row, and the send methods no longer
  dereference `None` when a template is missing entirely.
- SB-15: an update that would strip the last owner/admin of an organization of
  that role is refused.

Mirrors `tests/test_user_mixin.py`: module-level declarative Base, schema via
`create_all`, `models_pool` populated for the duration of each test. The user
model deliberately lists `UserMixin` **before** `ORMBaseMixin` — that is the
order `deepsel/apps/core/models/user.py` uses, and it is what puts
`UserMixin.update` in front of `ORMBaseMixin.update` in the MRO.
"""

import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    create_engine,
    text as sa_text,
)
from sqlalchemy.orm import Session, declarative_base, relationship

# NOTE: import deepsel.utils first to avoid a circular-import error during
# isolated collection (known package import-order quirk).
import deepsel.utils  # noqa: F401,E402
from deepsel.orm.mixin import ORMBaseMixin  # noqa: E402
from deepsel.orm.user_mixin import UserMixin  # noqa: E402
from deepsel.utils.models_pool import models_pool  # noqa: E402

Base = declarative_base()


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
    permissions = Column(String, nullable=True)
    organization_id = Column(Integer, nullable=False)


class UserModel(Base, UserMixin, ORMBaseMixin):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    email = Column(String(255))
    first_name = Column(String(100))
    last_name = Column(String(100))
    owner_id = Column(Integer, nullable=True)

    roles = relationship("RoleModel", secondary="user_role")

    @classmethod
    def _get_admin_role_string_ids(cls):
        return ["admin_role"]

    @classmethod
    def _get_app_secret(cls):
        return "test-secret"

    @classmethod
    def _get_auth_algorithm(cls):
        return "HS256"

    @classmethod
    def _get_frontend_url(cls):
        return "http://localhost:3000"

    @classmethod
    def _get_set_password_template_id(cls):
        return "setup_password_template"

    @classmethod
    def _get_reset_password_template_id(cls):
        return "reset_password_template"


class UserRoleModel(Base):
    __table__ = user_role_table


class OrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))


class EmailTemplateModel(Base, ORMBaseMixin):
    __tablename__ = "email_template"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=False)


@pytest.fixture(scope="module")
def engine(pg_container):
    eng = create_engine(pg_container.get_connection_url())
    Base.metadata.create_all(eng)
    # `ORMBaseMixin` auto-adds a globally unique `string_id`; in a real
    # deployment the schema manager rewrites that into a composite with
    # `organization_id` on tenant tables. `create_all` does not, and these
    # tests need the same string_id in two organizations.
    with eng.begin() as conn:
        for table in ("email_template", "role"):
            conn.execute(
                sa_text(f'ALTER TABLE "{table}" DROP CONSTRAINT {table}_string_id_key')
            )
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
    models_pool["user_role"] = UserRoleModel
    models_pool["email_template"] = EmailTemplateModel
    models_pool["organization"] = OrganizationModel
    yield session
    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


def _template(db, string_id, organization_id, name):
    template = EmailTemplateModel(
        string_id=string_id, organization_id=organization_id, name=name
    )
    db.add(template)
    db.flush()
    return template


def _role(db, string_id, organization_id):
    role = RoleModel(
        string_id=string_id, organization_id=organization_id, name=string_id
    )
    db.add(role)
    db.flush()
    return role


def _user(db, name, roles=None):
    user = UserModel(name=name, email=f"{name}@example.test")
    if roles:
        user.roles.extend(roles)
    db.add(user)
    db.flush()
    return user


class TestResolveEmailTemplate:
    """SB-6 / HB-1 / HB-2 — deterministic template resolution."""

    def test_prefers_the_callers_organization(self, db):
        _template(db, "setup_password_template", 1, "org 1 copy")
        _template(db, "setup_password_template", 2, "org 2 copy")

        resolved = UserModel._resolve_email_template(
            db, "setup_password_template", organization_id=2
        )
        assert resolved.name == "org 2 copy"

    def test_falls_back_to_the_lowest_id_copy(self, db):
        _template(db, "setup_password_template", 1, "org 1 copy")
        _template(db, "setup_password_template", 2, "org 2 copy")

        # Org 3 has no copy of its own — the fallback must be stable, not
        # whatever row the planner happened to return first.
        resolved = UserModel._resolve_email_template(
            db, "setup_password_template", organization_id=3
        )
        assert resolved.name == "org 1 copy"

    def test_returns_none_when_nothing_is_installed(self, db):
        assert UserModel._resolve_email_template(db, "nonexistent_template", 1) is None

    def test_send_set_password_email_survives_a_missing_template(self, db):
        """HB-2: `template.send(...)` used to be called on None."""
        user = _user(db, "invitee")
        assert asyncio.run(user.send_set_password_email(db, 1)) is False

    def test_email_reset_password_survives_a_missing_template(self, db):
        user = _user(db, "forgetful")
        assert asyncio.run(user.email_reset_password(db, 1)) is False


class TestLastProtectedRoleHolder:
    """SB-15 — the last owner of an organization cannot be demoted."""

    def test_demoting_a_non_last_owner_is_allowed(self, db):
        owner_role = _role(db, "owner_role", 1)
        tech_role = _role(db, "technician_role", 1)
        first = _user(db, "owner_one", [owner_role])
        second = _user(db, "owner_two", [owner_role])
        db.flush()

        second._check_not_last_protected_role_holder(
            db, {"roles": [{"id": tech_role.id}]}
        )
        second.roles = [tech_role]
        db.flush()

        # The remaining owner is now the last one.
        with pytest.raises(HTTPException) as exc:
            first._check_not_last_protected_role_holder(
                db, {"roles": [{"id": tech_role.id}]}
            )
        assert exc.value.status_code == 400

    def test_demoting_the_last_owner_is_refused(self, db):
        owner_role = _role(db, "owner_role", 1)
        tech_role = _role(db, "technician_role", 1)
        owner = _user(db, "sole_owner", [owner_role])
        db.flush()

        with pytest.raises(HTTPException) as exc:
            owner._check_not_last_protected_role_holder(
                db, {"roles": [{"id": tech_role.id}]}
            )
        assert exc.value.status_code == 400
        assert "owner_role" in exc.value.detail

    def test_keeping_the_role_alongside_others_is_allowed(self, db):
        owner_role = _role(db, "owner_role", 1)
        tech_role = _role(db, "technician_role", 1)
        owner = _user(db, "kept_owner", [owner_role])
        db.flush()

        owner._check_not_last_protected_role_holder(
            db, {"roles": [{"id": owner_role.id}, {"id": tech_role.id}]}
        )

    def test_another_org_last_owner_does_not_count(self, db):
        """Role rows are per-org, so org 2's owner cannot stand in for org 1's."""
        owner_role_org1 = _role(db, "owner_role", 1)
        owner_role_org2 = _role(db, "owner_role", 2)
        tech_role = _role(db, "technician_role", 1)
        _user(db, "org2_owner", [owner_role_org2])
        org1_owner = _user(db, "org1_owner", [owner_role_org1])
        db.flush()

        with pytest.raises(HTTPException):
            org1_owner._check_not_last_protected_role_holder(
                db, {"roles": [{"id": tech_role.id}]}
            )

    def test_an_update_that_does_not_touch_roles_is_untouched(self, db):
        owner_role = _role(db, "owner_role", 1)
        owner = _user(db, "renamer", [owner_role])
        db.flush()

        owner._check_not_last_protected_role_holder(db, {"name": "New Name"})

    def test_unprotected_roles_are_not_guarded(self, db):
        plain_role = _role(db, "user_role", 1)
        other_role = _role(db, "technician_role", 1)
        user = _user(db, "plain", [plain_role])
        db.flush()

        user._check_not_last_protected_role_holder(
            db, {"roles": [{"id": other_role.id}]}
        )
