"""Regression tests for deepsel.apps.core.mixins.orm.ORMBaseMixin's
_resolve_organization_on_create override.

Bug: a create request from a user whose permission scope for the table is
`*` (all) never got `organization_id` populated unless the caller passed it
explicitly in the request body — the X-Organization-Id header (surfaced as
`user.current_organization_id`) was ignored. For NOT-NULL `organization_id`
columns (e.g. `role`), this caused the insert to fail rather than 400.
"""

from sqlalchemy import Column, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from deepsel.apps.core.mixins.orm import ORMBaseMixin
from deepsel.sqlalchemy import DatabaseManager
from deepsel.utils.models_pool import models_pool

import pytest

Base = declarative_base()


class WidgetModel(Base, ORMBaseMixin):
    __tablename__ = "widget"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=False)
    owner_id = Column(Integer, nullable=True)


class MockUser:
    def __init__(self, id=1, current_organization_id=1, permissions=None, org_ids=None):
        self.id = id
        self.current_organization_id = current_organization_id
        self._permissions = permissions or []
        self._org_ids = org_ids or (
            [current_organization_id] if current_organization_id else []
        )

    def get_user_permissions(self):
        return self._permissions

    def get_org_ids(self):
        return self._org_ids


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    DatabaseManager(
        sqlalchemy_declarative_base=Base,
        db_url=url,
        models_pool={"widget": WidgetModel},
    )
    models_pool["widget"] = WidgetModel
    eng = create_engine(url)
    yield eng
    del models_pool["widget"]
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


def test_create_scope_all_without_explicit_org_resolves_from_header(db):
    """scope=* creator who omits organization_id must still get it from
    user.current_organization_id (the X-Organization-Id header), not leave
    it unset."""
    user = MockUser(current_organization_id=5, permissions=["widget:*:*"])
    widget = WidgetModel.create(db, user, {"name": "NoExplicitOrg"}, commit=False)
    assert widget.organization_id == 5  # nosec B101


def test_create_scope_all_with_explicit_org_id_honors_it(db):
    """scope=* creator targeting a different org via an explicit
    organization_id in the payload keeps that behavior unchanged."""
    user = MockUser(current_organization_id=1, permissions=["widget:*:*"])
    widget = WidgetModel.create(
        db, user, {"name": "ExplicitOrg", "organization_id": 99}, commit=False
    )
    assert widget.organization_id == 99  # nosec B101


def test_create_scope_all_without_org_and_without_header_raises_400(db):
    """scope=* creator with neither an explicit organization_id nor a
    current_organization_id (header) still gets a clear 400, not a DB
    constraint failure."""
    from fastapi import HTTPException

    user = MockUser(
        current_organization_id=None, permissions=["widget:*:*"], org_ids=[]
    )
    with pytest.raises(HTTPException) as exc_info:
        WidgetModel.create(db, user, {"name": "NoOrgAtAll"}, commit=False)
    assert exc_info.value.status_code == 400  # nosec B101
