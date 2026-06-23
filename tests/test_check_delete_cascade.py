"""Tests for ``get_delete_cascade_records_recursively``.

These require a real Postgres instance because the function queries
``pg_constraint`` and uses a SQLAlchemy inspector against a live engine.
We mirror ``tests/test_mixin.py``: a module-level declarative ``Base`` with a
small FK graph, schema built via ``create_all``, and ``models_pool`` populated
for the duration of each test.
"""

import pytest
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship

# NOTE: ``deepsel.utils`` must be imported before ``deepsel.orm.mixin`` to
# break a circular import (mixin -> utils.check_delete_cascade -> utils
# __init__ -> crud_router -> orm). Importing the utils package first lets it
# finish initializing before the orm package pulls it back in.
import deepsel.utils  # noqa: F401,E402  (import first to avoid circular import)
from deepsel.orm.mixin import ORMBaseMixin  # noqa: E402
from deepsel.utils.check_delete_cascade import (  # noqa: E402
    AffectedRecord,
    AffectedRecordResult,
    get_delete_cascade_records_recursively,
)
from deepsel.utils.models_pool import models_pool  # noqa: E402

# ---------------------------------------------------------------------------
# Test models & FK graph
# ---------------------------------------------------------------------------

Base = declarative_base()


class ParentModel(Base, ORMBaseMixin):
    __tablename__ = "parent"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)
    # SA-managed secondary relationship -> should be SKIPPED by the cascade.
    things = relationship("ThingModel", secondary="parent_thing_managed")


class ChildHardModel(Base, ORMBaseMixin):
    """NOT NULL FK to parent -> referring records go into ``to_delete``."""

    __tablename__ = "childhard"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    parent_id = Column(Integer, ForeignKey("parent.id"), nullable=False)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)


class ChildSoftModel(Base, ORMBaseMixin):
    """Nullable FK to parent -> referring records go into ``to_set_null``."""

    __tablename__ = "childsoft"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    parent_id = Column(Integer, ForeignKey("parent.id"), nullable=True)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)


class GrandChildModel(Base, ORMBaseMixin):
    """NOT NULL FK to childhard -> exercises recursion into ``to_delete``."""

    __tablename__ = "grandchild"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    childhard_id = Column(Integer, ForeignKey("childhard.id"), nullable=False)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)


class ThingModel(Base, ORMBaseMixin):
    __tablename__ = "thing"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)


# Raw junction table referencing parent, with NO model registered in
# models_pool -> exercises the JunctionDelete branch.
parent_thing_raw = Table(
    "parent_thing_raw",
    Base.metadata,
    Column("parent_id", Integer, ForeignKey("parent.id"), primary_key=True),
    Column("thing_id", Integer, ForeignKey("thing.id"), primary_key=True),
)

# Junction table managed by the parent's ``secondary=`` relationship ->
# exercises the skip branch (no JunctionDelete should be produced).
parent_thing_managed = Table(
    "parent_thing_managed",
    Base.metadata,
    Column("parent_id", Integer, ForeignKey("parent.id"), primary_key=True),
    Column("thing_id", Integer, ForeignKey("thing.id"), primary_key=True),
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

    # Populate models_pool for the duration of the test. Deliberately DO NOT
    # register ``parent_thing_raw`` (so it is treated as a raw junction). We
    # also leave ``parent_thing_managed`` unregistered; the parent detects it
    # via its ``secondary=`` relationship and skips it.
    old_pool = dict(models_pool)
    models_pool["parent"] = ParentModel
    models_pool["childhard"] = ChildHardModel
    models_pool["childsoft"] = ChildSoftModel
    models_pool["grandchild"] = GrandChildModel
    models_pool["thing"] = ThingModel

    yield session

    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


# ---------------------------------------------------------------------------
# Insertion helpers
# ---------------------------------------------------------------------------


def _add_parent(db, **kw):
    p = ParentModel(**kw)
    db.add(p)
    db.flush()
    return p


def _add_child_hard(db, parent_id, **kw):
    c = ChildHardModel(parent_id=parent_id, **kw)
    db.add(c)
    db.flush()
    return c


def _add_child_soft(db, parent_id, **kw):
    c = ChildSoftModel(parent_id=parent_id, **kw)
    db.add(c)
    db.flush()
    return c


def _add_grandchild(db, childhard_id, **kw):
    g = GrandChildModel(childhard_id=childhard_id, **kw)
    db.add(g)
    db.flush()
    return g


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEmptyAndNoReferrers:
    def test_empty_records_returns_accumulator_unchanged(self, db):
        result = get_delete_cascade_records_recursively(db, [], declarative_base=Base)
        assert isinstance(result, AffectedRecordResult)
        assert result.to_delete == {}
        assert result.to_set_null == {}
        assert result.junction_deletes == []

    def test_empty_records_preserves_passed_accumulator(self, db):
        acc = AffectedRecordResult(to_delete={}, to_set_null={})
        result = get_delete_cascade_records_recursively(
            db, [], affected_records=acc, declarative_base=Base
        )
        assert result is acc

    def test_no_referring_records_does_not_add_table_key(self, db):
        # A parent with no child/grandchild rows: those tables get no entry.
        # (The function only adds a table key once it finds referring rows.)
        # Note: the raw junction table still yields a JunctionDelete because
        # the function emits one per referring FK column without checking for
        # actual join rows — so we don't assert junction_deletes is empty here.
        parent = _add_parent(db, name="lonely")
        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )
        assert "childhard" not in result.to_delete
        assert "childsoft" not in result.to_set_null
        # No model-backed referrers were collected.
        assert result.to_delete == {}
        assert result.to_set_null == {}


class TestNotNullAndNullable:
    def test_not_null_child_goes_to_delete(self, db):
        parent = _add_parent(db, name="p")
        child = _add_child_hard(db, parent.id, name="hard")

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        assert "childhard" in result.to_delete
        records = result.to_delete["childhard"]
        assert len(records) == 1
        affected = next(iter(records))
        assert affected.record.id == child.id
        assert affected.affected_field == "parent_id"
        # NOT NULL referrer must not appear in to_set_null.
        assert "childhard" not in result.to_set_null

    def test_nullable_child_goes_to_set_null(self, db):
        parent = _add_parent(db, name="p")
        child = _add_child_soft(db, parent.id, name="soft")

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        assert "childsoft" in result.to_set_null
        records = result.to_set_null["childsoft"]
        assert len(records) == 1
        affected = next(iter(records))
        assert affected.record.id == child.id
        assert affected.affected_field == "parent_id"
        assert "childsoft" not in result.to_delete

    def test_mixed_graph_populates_both_dicts(self, db):
        parent = _add_parent(db, name="p")
        hard = _add_child_hard(db, parent.id, name="hard")
        soft = _add_child_soft(db, parent.id, name="soft")

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        assert {r.record.id for r in result.to_delete["childhard"]} == {hard.id}
        assert {r.record.id for r in result.to_set_null["childsoft"]} == {soft.id}


class TestRecursion:
    def test_recurses_into_grandchildren(self, db):
        parent = _add_parent(db, name="p")
        hard = _add_child_hard(db, parent.id, name="hard")
        grand = _add_grandchild(db, hard.id, name="grand")

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        assert "childhard" in result.to_delete
        assert {r.record.id for r in result.to_delete["childhard"]} == {hard.id}
        # Recursion: the grandchild (NOT NULL FK to childhard) is collected too.
        assert "grandchild" in result.to_delete
        grand_records = result.to_delete["grandchild"]
        assert {r.record.id for r in grand_records} == {grand.id}
        assert next(iter(grand_records)).affected_field == "childhard_id"

    def test_no_recursion_for_nullable_chain(self, db):
        # Soft child is set-null, so its own referrers are NOT followed.
        parent = _add_parent(db, name="p")
        _add_child_soft(db, parent.id, name="soft")

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        assert "childsoft" in result.to_set_null
        assert result.to_delete == {}


class TestJunctionTables:
    def test_raw_junction_produces_junction_delete(self, db):
        parent = _add_parent(db, name="p")
        thing = ThingModel(name="t")
        db.add(thing)
        db.flush()
        db.execute(
            parent_thing_raw.insert().values(parent_id=parent.id, thing_id=thing.id)
        )
        db.flush()

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        raw_deletes = [
            jd for jd in result.junction_deletes if jd.table_name == "parent_thing_raw"
        ]
        assert len(raw_deletes) == 1
        jd = raw_deletes[0]
        assert jd.column == "parent_id"
        assert jd.ids == [parent.id]

    def test_sa_managed_secondary_is_skipped(self, db):
        parent = _add_parent(db, name="p")
        thing = ThingModel(name="t")
        db.add(thing)
        db.flush()
        db.execute(
            parent_thing_managed.insert().values(parent_id=parent.id, thing_id=thing.id)
        )
        db.flush()

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        managed_deletes = [
            jd
            for jd in result.junction_deletes
            if jd.table_name == "parent_thing_managed"
        ]
        assert managed_deletes == []

    def test_both_junctions_present_only_raw_emitted(self, db):
        parent = _add_parent(db, name="p")
        thing = ThingModel(name="t")
        db.add(thing)
        db.flush()
        db.execute(
            parent_thing_raw.insert().values(parent_id=parent.id, thing_id=thing.id)
        )
        db.execute(
            parent_thing_managed.insert().values(parent_id=parent.id, thing_id=thing.id)
        )
        db.flush()

        result = get_delete_cascade_records_recursively(
            db, [parent], declarative_base=Base
        )

        emitted_tables = {jd.table_name for jd in result.junction_deletes}
        assert "parent_thing_raw" in emitted_tables
        assert "parent_thing_managed" not in emitted_tables


class TestAffectedRecordHashEq:
    def _rec(self, _id):
        class _R:
            pass

        r = _R()
        r.id = _id
        return r

    def test_equal_when_same_id_and_field(self):
        rec = self._rec(1)
        a = AffectedRecord(record=rec, affected_field="parent_id")
        b = AffectedRecord(record=rec, affected_field="parent_id")
        assert a == b
        assert hash(a) == hash(b)
        assert len({a, b}) == 1

    def test_dedup_in_set_with_distinct_record_objects_same_id(self):
        a = AffectedRecord(record=self._rec(5), affected_field="parent_id")
        b = AffectedRecord(record=self._rec(5), affected_field="parent_id")
        assert a == b
        assert len({a, b}) == 1

    def test_not_equal_when_field_differs(self):
        rec = self._rec(1)
        a = AffectedRecord(record=rec, affected_field="parent_id")
        b = AffectedRecord(record=rec, affected_field="other_id")
        assert a != b
        assert len({a, b}) == 2

    def test_not_equal_when_id_differs(self):
        a = AffectedRecord(record=self._rec(1), affected_field="parent_id")
        b = AffectedRecord(record=self._rec(2), affected_field="parent_id")
        assert a != b
        assert len({a, b}) == 2

    def test_not_equal_to_non_affected_record(self):
        a = AffectedRecord(record=self._rec(1), affected_field="parent_id")
        assert a != object()
