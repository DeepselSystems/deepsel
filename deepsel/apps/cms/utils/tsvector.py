from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator
from sqlalchemy.dialects.postgresql import TSVECTOR as PG_TSVECTOR


class TSVector(TypeDecorator):
    """TSVECTOR on PostgreSQL, falls back to Text on other dialects."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_TSVECTOR())
        return dialect.type_descriptor(Text())
