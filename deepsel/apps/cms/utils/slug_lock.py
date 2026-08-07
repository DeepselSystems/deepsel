from sqlalchemy import text
from sqlalchemy.orm import Session


def acquire_slug_lock(db: Session, *key_parts) -> None:
    """
    Serialize concurrent slug create/update requests for the same key without
    a database schema change.

    Slug uniqueness is validated with a check-then-write (query for a
    conflict, then insert/update): two requests for the same slug can both
    pass the check before either commits, producing duplicate slugs. Taking a
    Postgres transaction-scoped advisory lock on a hash of `key_parts` before
    the check forces concurrent requests for the same key to run one at a
    time — the second one only starts its check after the first has committed
    (and released the lock), so it correctly sees the first's row.

    The lock is tied to the current transaction (`pg_advisory_xact_lock`) and
    is released automatically on commit or rollback — no unlock call needed,
    and no risk of a leaked lock outliving the request.
    """
    lock_key = ":".join(str(part) for part in key_parts)
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": lock_key},
    )
