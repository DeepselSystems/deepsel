import threading
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from deepsel.apps.cms.utils.slug_lock import acquire_slug_lock
from deepsel.utils.models_pool import models_pool

OrganizationModel = models_pool["organization"]
BlogPostModel = models_pool["blog_post"]
LocaleModel = models_pool["locale"]
PageModel = models_pool["page"]
PageContentModel = models_pool["page_content"]

# How long the lock holder in the serialization tests sleeps before
# committing/releasing. The "waiter" assertion checks it was blocked for at
# least a chunk of this, so it must be well above scheduling/query jitter.
LOCK_HOLD_SECONDS = 0.2
MIN_EXPECTED_WAIT_SECONDS = 0.15
MAX_UNCONTENDED_WAIT_SECONDS = 0.1


def _second_session(pg_url: str, isolated_schema: str):
    """A second, independent DB connection against the same test schema.

    Postgres advisory locks are scoped per-connection (or per-transaction for
    the `_xact` variant used here), so proving two requests actually
    serialize requires two real connections — a second ORM `Session` sharing
    the same connection as the `db` fixture would not exercise the lock at
    all.
    """
    db_url = f"{pg_url}?options=-c%20search_path%3D{isolated_schema}"
    engine = create_engine(db_url)
    session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    return session, engine


def test_acquire_slug_lock_serializes_same_key(
    db: Session, pg_url: str, isolated_schema: str
):
    """A second session requesting the same lock key must wait until the
    first session's transaction ends (commit releases pg_advisory_xact_lock)."""
    session_b, engine_b = _second_session(pg_url, isolated_schema)
    try:
        acquire_slug_lock(db, "blog_post", 1, "/same-slug")

        released_at = {}

        def hold_then_release():
            time.sleep(LOCK_HOLD_SECONDS)
            released_at["t"] = time.monotonic()
            db.commit()

        holder = threading.Thread(target=hold_then_release)
        holder.start()

        start = time.monotonic()
        acquire_slug_lock(session_b, "blog_post", 1, "/same-slug")
        acquired_at = time.monotonic()
        holder.join()

        assert acquired_at - start >= MIN_EXPECTED_WAIT_SECONDS  # nosec B101
        assert acquired_at >= released_at["t"]  # nosec B101
    finally:
        session_b.rollback()
        session_b.close()
        engine_b.dispose()


def test_acquire_slug_lock_does_not_block_different_keys(
    db: Session, pg_url: str, isolated_schema: str
):
    """Locking one slug key must not delay a request for an unrelated key."""
    session_b, engine_b = _second_session(pg_url, isolated_schema)
    try:
        acquire_slug_lock(db, "blog_post", 1, "/slug-a")

        start = time.monotonic()
        acquire_slug_lock(session_b, "blog_post", 1, "/slug-b")
        elapsed = time.monotonic() - start

        assert elapsed < MAX_UNCONTENDED_WAIT_SECONDS  # nosec B101
    finally:
        session_b.rollback()
        session_b.close()
        engine_b.dispose()


def test_concurrent_blog_post_create_same_slug_only_one_succeeds(
    db: Session, pg_url: str, isolated_schema: str
):
    """Regression test for the check-then-write race: two requests validating
    and inserting the same slug at the same time must not both succeed, even
    though there is no DB-level unique constraint backing the check."""
    org = OrganizationModel(name="Test Org")
    db.add(org)
    db.commit()
    organization_id = org.id

    session_b, engine_b = _second_session(pg_url, isolated_schema)
    outcomes = {}

    def attempt(session: Session, key: str):
        try:
            BlogPostModel._validate_slug(session, "/race", organization_id)
            post = BlogPostModel(slug="/race", organization_id=organization_id)
            session.add(post)
            session.commit()
            outcomes[key] = "created"
        except Exception:
            session.rollback()
            outcomes[key] = "rejected"

    t1 = threading.Thread(target=attempt, args=(db, "a"))
    t2 = threading.Thread(target=attempt, args=(session_b, "b"))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    session_b.close()
    engine_b.dispose()

    assert sorted(outcomes.values()) == ["created", "rejected"]  # nosec B101
    count = (
        db.query(BlogPostModel)
        .filter(
            BlogPostModel.organization_id == organization_id,
            BlogPostModel.slug == "/race",
        )
        .count()
    )
    assert count == 1  # nosec B101


def test_concurrent_page_content_create_same_slug_only_one_succeeds(
    db: Session, pg_url: str, isolated_schema: str
):
    """Same race as above, for page_content — the table Codex flagged
    directly — scoped by (organization_id, locale_id, slug)."""
    org = OrganizationModel(name="Test Org")
    locale = LocaleModel(name="English", iso_code="en")
    db.add_all([org, locale])
    db.commit()
    organization_id, locale_id = org.id, locale.id

    page_a = PageModel(organization_id=organization_id)
    db.add(page_a)
    db.commit()
    page_a_id = page_a.id

    session_b, engine_b = _second_session(pg_url, isolated_schema)
    page_b = PageModel(organization_id=organization_id)
    session_b.add(page_b)
    session_b.commit()
    page_b_id = page_b.id

    outcomes = {}

    def attempt(session: Session, key: str, page_id: int):
        try:
            PageContentModel._validate_slug(
                session, "/race", locale_id, organization_id
            )
            content = PageContentModel(
                title="Race",
                slug="/race",
                locale_id=locale_id,
                page_id=page_id,
                organization_id=organization_id,
            )
            session.add(content)
            session.commit()
            outcomes[key] = "created"
        except Exception:
            session.rollback()
            outcomes[key] = "rejected"

    t1 = threading.Thread(target=attempt, args=(db, "a", page_a_id))
    t2 = threading.Thread(target=attempt, args=(session_b, "b", page_b_id))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    session_b.close()
    engine_b.dispose()

    assert sorted(outcomes.values()) == ["created", "rejected"]  # nosec B101
    count = (
        db.query(PageContentModel)
        .filter(
            PageContentModel.organization_id == organization_id,
            PageContentModel.locale_id == locale_id,
            PageContentModel.slug == "/race",
        )
        .count()
    )
    assert count == 1  # nosec B101
