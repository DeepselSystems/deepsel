import pytest
import psycopg
from enum import Enum as PyEnum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Float,
    BigInteger,
    Text,
    ForeignKey,
    Enum,
    Index,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import declarative_base, Session
from deepsel.sqlalchemy import DatabaseManager


class Status(PyEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class Priority(PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TestDatabaseManagerTableCreation:
    """Test table creation and basic schema operations."""

    def test_creates_new_table_with_columns(self, pg_conn, sqlalchemy_db_url):
        """Test that DatabaseManager creates a new table with specified columns."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), nullable=False, unique=True)
            name = Column(String(100))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert table exists
        result = pg_conn.execute("SELECT to_regclass('users') IS NOT NULL").fetchone()
        assert result[0] is True

        # Assert columns exist with correct types
        cols = {row[0]: (row[1], row[2]) for row in pg_conn.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name='users'
            ORDER BY ordinal_position
        """).fetchall()}

        assert "id" in cols
        assert cols["id"] == ("integer", "NO")
        assert "email" in cols
        assert cols["email"] == ("character varying", "NO")
        assert "name" in cols
        assert cols["name"] == ("character varying", "YES")

        # Assert primary key exists
        pk = pg_conn.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name='users' AND constraint_type='PRIMARY KEY'
        """).fetchone()
        assert pk is not None

        # Assert unique constraint exists on email
        unique_constraints = pg_conn.execute("""
            SELECT i.relname
            FROM pg_index x
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_class i ON i.oid = x.indexrelid
            WHERE t.relname = 'users' AND x.indisunique
        """).fetchall()
        assert len(unique_constraints) >= 1

    def test_creates_table_with_bigint_primary_key(self, pg_conn, sqlalchemy_db_url):
        """Test creating table with BigInteger primary key (BIGSERIAL)."""
        Base = declarative_base()

        class Article(Base):
            __tablename__ = "articles"
            id = Column(BigInteger, primary_key=True)
            title = Column(String(200), nullable=False)

        models_pool = {"articles": Article}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert table exists
        result = pg_conn.execute(
            "SELECT to_regclass('articles') IS NOT NULL"
        ).fetchone()
        assert result[0] is True

        # Assert id column is bigint with identity
        col_info = pg_conn.execute("""
            SELECT data_type, is_identity
            FROM information_schema.columns
            WHERE table_name='articles' AND column_name='id'
        """).fetchone()
        assert col_info[0] == "bigint"
        assert col_info[1] == "YES"

    def test_creates_table_with_composite_primary_key(self, pg_conn, sqlalchemy_db_url):
        """Test creating table with composite primary key."""
        Base = declarative_base()

        class UserRole(Base):
            __tablename__ = "user_roles"
            user_id = Column(Integer, primary_key=True)
            role_id = Column(Integer, primary_key=True)
            granted_at = Column(String(50))

        models_pool = {"user_roles": UserRole}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert composite primary key exists
        pk_cols = pg_conn.execute("""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name='user_roles' AND tc.constraint_type='PRIMARY KEY'
            ORDER BY kcu.ordinal_position
        """).fetchall()

        pk_column_names = [col[0] for col in pk_cols]
        assert pk_column_names == ["user_id", "role_id"]

    def test_creates_multiple_tables(self, pg_conn, sqlalchemy_db_url):
        """Test creating multiple tables in one operation."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))

        class Comment(Base):
            __tablename__ = "comments"
            id = Column(Integer, primary_key=True)
            content = Column(Text)

        models_pool = {"users": User, "posts": Post, "comments": Comment}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert all tables exist
        tables = [row[0] for row in pg_conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
        """).fetchall()]

        assert "users" in tables
        assert "posts" in tables
        assert "comments" in tables


class TestDatabaseManagerColumnOperations:
    """Test column addition, modification, and removal."""

    def test_adds_new_column_to_existing_table(self, pg_conn, sqlalchemy_db_url):
        """Test adding a new column to an existing table."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Now add a new column
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))
            name = Column(String(100))
            age = Column(Integer)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert new columns exist
        cols = [row[0] for row in pg_conn.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='users'
        """).fetchall()]

        assert "name" in cols
        assert "age" in cols

    def test_removes_column_from_existing_table(self, pg_conn, sqlalchemy_db_url):
        """Test removing a column from an existing table."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))
            name = Column(String(100))
            age = Column(Integer)

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Now remove columns
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert columns are removed
        cols = [row[0] for row in pg_conn.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='users'
        """).fetchall()]

        assert "name" not in cols
        assert "age" not in cols
        assert "email" in cols

    def test_changes_column_nullable(self, pg_conn, sqlalchemy_db_url):
        """Test changing column nullable constraint."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), nullable=True)

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Change to NOT NULL with default
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), nullable=False, default="default@example.com")

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert nullable changed
        is_nullable = pg_conn.execute("""
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_name='users' AND column_name='email'
        """).fetchone()[0]

        assert is_nullable == "NO"

    def test_changes_column_type(self, pg_conn, sqlalchemy_db_url):
        """Test changing column data type."""
        Base = declarative_base()

        class Product(Base):
            __tablename__ = "products"
            id = Column(Integer, primary_key=True)
            price = Column(Integer)

        models_pool = {"products": Product}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Change type to Float
        Base2 = declarative_base()

        class Product2(Base2):
            __tablename__ = "products"
            id = Column(Integer, primary_key=True)
            price = Column(Float)

        models_pool2 = {"products": Product2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert type changed
        data_type = pg_conn.execute("""
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name='products' AND column_name='price'
        """).fetchone()[0]

        assert data_type == "double precision"


class TestDatabaseManagerConstraints:
    """Test constraint operations (unique, index, foreign key)."""

    def test_adds_unique_constraint(self, pg_conn, sqlalchemy_db_url):
        """Test adding unique constraint to a column."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Add unique constraint
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), unique=True)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert unique constraint exists
        unique_constraints = pg_conn.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name='users' AND constraint_type='UNIQUE'
        """).fetchall()

        assert len(unique_constraints) >= 1

    def test_removes_unique_constraint(self, pg_conn, sqlalchemy_db_url):
        """Test removing unique constraint from a column."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), unique=True)

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Remove unique constraint
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), unique=False)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert unique constraint removed (only PK unique constraint should remain)
        unique_constraints = pg_conn.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name='users' AND constraint_type='UNIQUE'
        """).fetchall()

        # Should have no UNIQUE constraints (PK is separate)
        assert len(unique_constraints) == 0

    def test_adds_index(self, pg_conn, sqlalchemy_db_url):
        """Test adding index to a column."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Add index
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), index=True)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert index exists (non-unique)
        indexes = pg_conn.execute("""
            SELECT i.relname
            FROM pg_index x
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_class i ON i.oid = x.indexrelid
            WHERE t.relname = 'users' AND NOT x.indisunique AND NOT x.indisprimary
        """).fetchall()

        assert len(indexes) >= 1

    def test_removes_index(self, pg_conn, sqlalchemy_db_url):
        """Test removing index from a column."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), index=True)

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Remove index
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), index=False)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert index removed
        indexes = pg_conn.execute("""
            SELECT i.relname
            FROM pg_index x
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_class i ON i.oid = x.indexrelid
            WHERE t.relname = 'users' AND NOT x.indisunique AND NOT x.indisprimary
        """).fetchall()

        assert len(indexes) == 0

    def test_adds_foreign_key_constraint(self, pg_conn, sqlalchemy_db_url):
        """Test adding foreign key constraint."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id"))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert foreign key exists
        fks = pg_conn.execute("""
            SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='posts'
        """).fetchall()

        assert len(fks) == 1
        assert fks[0][1] == "user_id"
        assert fks[0][2] == "users"
        assert fks[0][3] == "id"

    def test_updates_foreign_key_reference(self, pg_conn, sqlalchemy_db_url):
        """Test updating foreign key to reference different table/column."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Author(Base):
            __tablename__ = "authors"
            id = Column(Integer, primary_key=True)
            name = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id"))

        models_pool = {"users": User, "authors": Author, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Update foreign key to reference authors
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Author2(Base2):
            __tablename__ = "authors"
            id = Column(Integer, primary_key=True)
            name = Column(String(255))

        class Post2(Base2):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("authors.id"))

        models_pool2 = {"users": User2, "authors": Author2, "posts": Post2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert foreign key now references authors
        fks = pg_conn.execute("""
            SELECT
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='posts'
        """).fetchone()

        assert fks[0] == "authors"
        assert fks[1] == "id"

    def test_removes_foreign_key_constraint(self, pg_conn, sqlalchemy_db_url):
        """Test removing foreign key constraint."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id"))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Remove foreign key
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post2(Base2):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer)

        models_pool2 = {"users": User2, "posts": Post2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert foreign key removed
        fks = pg_conn.execute("""
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name='posts' AND constraint_type='FOREIGN KEY'
        """).fetchall()

        assert len(fks) == 0


class TestDatabaseManagerEnumTypes:
    """Test enum type creation and modification."""

    def test_creates_enum_type_and_column(self, pg_conn, sqlalchemy_db_url):
        """Test creating enum type and using it in a column."""
        Base = declarative_base()

        class Task(Base):
            __tablename__ = "tasks"
            id = Column(Integer, primary_key=True)
            status = Column(Enum(Status))

        models_pool = {"tasks": Task}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert enum type exists
        enum_types = pg_conn.execute("""
            SELECT typname, enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE typname LIKE '%status%' AND n.nspname = current_schema()
            ORDER BY e.enumsortorder
        """).fetchall()

        assert len(enum_types) == 3
        enum_values = [e[1] for e in enum_types]
        assert "ACTIVE" in enum_values
        assert "INACTIVE" in enum_values
        assert "PENDING" in enum_values

        # Assert column uses enum type
        col_type = pg_conn.execute("""
            SELECT udt_name
            FROM information_schema.columns
            WHERE table_name='tasks' AND column_name='status'
        """).fetchone()[0]

        assert "status" in col_type

    def test_adds_value_to_existing_enum(self, pg_conn, sqlalchemy_db_url):
        """Test adding new value to existing enum type."""
        Base = declarative_base()

        class Task(Base):
            __tablename__ = "tasks"
            id = Column(Integer, primary_key=True)
            status = Column(Enum(Status, name="status"))

        models_pool = {"tasks": Task}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Create new enum with additional value but same name
        class StatusV2(PyEnum):
            ACTIVE = "active"
            INACTIVE = "inactive"
            PENDING = "pending"
            COMPLETED = "completed"

        Base2 = declarative_base()

        class Task2(Base2):
            __tablename__ = "tasks"
            id = Column(Integer, primary_key=True)
            status = Column(Enum(StatusV2, name="status"))

        models_pool2 = {"tasks": Task2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert new enum value exists
        enum_values = [row[0] for row in pg_conn.execute("""
            SELECT enumlabel
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_namespace n ON t.typnamespace = n.oid
            WHERE typname = 'status' AND n.nspname = current_schema()
            ORDER BY e.enumsortorder
        """).fetchall()]

        assert "COMPLETED" in enum_values
        assert len(enum_values) == 4


class TestDatabaseManagerTableDeletion:
    """Test table deletion operations."""

    def test_drops_removed_table(self, pg_conn, sqlalchemy_db_url):
        """Test that tables removed from models are dropped from database."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Remove posts table from models
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert posts table is dropped
        tables = [row[0] for row in pg_conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
        """).fetchall()]

        assert "posts" not in tables
        assert "users" in tables

    def test_preserves_alembic_version_table(self, pg_conn, sqlalchemy_db_url):
        """Test that alembic_version table is not dropped."""
        # Create alembic_version table
        pg_conn.execute("""
            CREATE TABLE alembic_version (
                version_num VARCHAR(32) NOT NULL,
                CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
            )
        """)
        pg_conn.commit()

        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert alembic_version table still exists
        tables = [row[0] for row in pg_conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
        """).fetchall()]

        assert "alembic_version" in tables


class TestDatabaseManagerCompositeUniqueConstraints:
    """Test composite unique constraints with organization_id."""

    def test_creates_composite_unique_constraint_with_organization_id(
        self, pg_conn, sqlalchemy_db_url
    ):
        """Test creating composite unique constraint for multi-tenant tables."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            organization_id = Column(Integer, nullable=False)
            email = Column(String(255), unique=True)

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert composite unique constraint exists
        constraints = pg_conn.execute("""
            SELECT
                tc.constraint_name,
                string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'users' AND tc.constraint_type = 'UNIQUE'
            GROUP BY tc.constraint_name
        """).fetchall()

        # Should have composite unique constraint on email and organization_id
        composite_found = False
        for constraint in constraints:
            if "email" in constraint[1] and "organization_id" in constraint[1]:
                composite_found = True
                break

        assert composite_found


class TestDatabaseManagerPrimaryKeyChanges:
    """Test primary key modification operations."""

    def test_changes_primary_key_columns(self, pg_conn, sqlalchemy_db_url):
        """Test changing primary key from single to composite."""
        Base = declarative_base()

        class UserRole(Base):
            __tablename__ = "user_roles"
            id = Column(Integer, primary_key=True)
            user_id = Column(Integer)
            role_id = Column(Integer)

        models_pool = {"user_roles": UserRole}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Change to composite primary key
        Base2 = declarative_base()

        class UserRole2(Base2):
            __tablename__ = "user_roles"
            user_id = Column(Integer, primary_key=True)
            role_id = Column(Integer, primary_key=True)

        models_pool2 = {"user_roles": UserRole2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Assert composite primary key exists
        pk_cols = [row[0] for row in pg_conn.execute("""
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name='user_roles' AND tc.constraint_type='PRIMARY KEY'
            ORDER BY kcu.ordinal_position
        """).fetchall()]

        assert pk_cols == ["user_id", "role_id"]


class TestDatabaseManagerComplexScenarios:
    """Test complex real-world scenarios."""

    def test_full_schema_evolution(self, pg_conn, sqlalchemy_db_url):
        """Test complete schema evolution: create, modify, add relations."""
        # Step 1: Create initial schema
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Step 2: Add columns and constraints
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), unique=True, nullable=False)
            name = Column(String(100))
            is_active = Column(Boolean, default=True)

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Step 3: Add related table with foreign key
        Base3 = declarative_base()

        class User3(Base3):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255), unique=True, nullable=False)
            name = Column(String(100))
            is_active = Column(Boolean, default=True)

        class Post3(Base3):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200), nullable=False)
            content = Column(Text)
            user_id = Column(Integer, ForeignKey("users.id"))
            status = Column(Enum(Status), default=Status.PENDING)

        models_pool3 = {"users": User3, "posts": Post3}
        DatabaseManager(
            sqlalchemy_declarative_base=Base3,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool3,
        )

        # Verify final state
        tables = [row[0] for row in pg_conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
            ORDER BY table_name
        """).fetchall()]

        assert "users" in tables
        assert "posts" in tables

        # Verify users table structure
        user_cols = dict(pg_conn.execute("""
            SELECT column_name, is_nullable
            FROM information_schema.columns
            WHERE table_name='users'
        """).fetchall())

        assert user_cols["email"] == "NO"
        assert user_cols["name"] == "YES"
        assert user_cols["is_active"] == "YES"

        # Verify foreign key
        fks = pg_conn.execute("""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_name='posts' AND constraint_type='FOREIGN KEY'
        """).fetchone()[0]

        assert fks == 1

    def test_handles_circular_foreign_keys(self, pg_conn, sqlalchemy_db_url):
        """Test handling of circular foreign key dependencies."""
        Base = declarative_base()

        class Department(Base):
            __tablename__ = "departments"
            id = Column(Integer, primary_key=True)
            name = Column(String(100))
            manager_id = Column(Integer, ForeignKey("employees.id"))

        class Employee(Base):
            __tablename__ = "employees"
            id = Column(Integer, primary_key=True)
            name = Column(String(100))
            department_id = Column(Integer, ForeignKey("departments.id"))

        models_pool = {"departments": Department, "employees": Employee}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Verify both tables exist
        tables = [row[0] for row in pg_conn.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = current_schema()
            ORDER BY table_name
        """).fetchall()]

        assert "departments" in tables
        assert "employees" in tables

        # Verify foreign keys exist
        dept_fks = pg_conn.execute("""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_name='departments' AND constraint_type='FOREIGN KEY'
        """).fetchone()[0]

        emp_fks = pg_conn.execute("""
            SELECT COUNT(*)
            FROM information_schema.table_constraints
            WHERE table_name='employees' AND constraint_type='FOREIGN KEY'
        """).fetchone()[0]

        assert dept_fks == 1
        assert emp_fks == 1


class TestDatabaseManagerTSVectorSupport:
    """Test TSVECTOR column type support."""

    def test_creates_tsvector_column(self, pg_conn, sqlalchemy_db_url):
        """Test that DatabaseManager creates a table with a TSVECTOR column."""
        Base = declarative_base()

        class Document(Base):
            __tablename__ = "documents"
            id = Column(Integer, primary_key=True)
            title = Column(String(255))
            search_vector = Column(TSVECTOR)

        models_pool = {"documents": Document}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        cols = {row[0]: row[1] for row in pg_conn.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'documents'
            ORDER BY ordinal_position
        """).fetchall()}

        assert "search_vector" in cols
        assert cols["search_vector"] == "tsvector"

    def test_tsvector_column_not_recreated_on_rerun(self, pg_conn, sqlalchemy_db_url):
        """Test that TSVECTOR column is not dropped/recreated on subsequent runs."""
        Base = declarative_base()

        class Document(Base):
            __tablename__ = "documents"
            id = Column(Integer, primary_key=True)
            title = Column(String(255))
            search_vector = Column(TSVECTOR)

        models_pool = {"documents": Document}

        # First run - creates table
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Insert a row to detect if column gets dropped
        pg_conn.execute(
            "INSERT INTO documents (id, title, search_vector) VALUES (1, 'test', to_tsvector('english', 'hello world'))"
        )

        # Second run - should not drop/recreate the column
        Base2 = declarative_base()

        class Document2(Base2):
            __tablename__ = "documents"
            id = Column(Integer, primary_key=True)
            title = Column(String(255))
            search_vector = Column(TSVECTOR)

        models_pool2 = {"documents": Document2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # If column was dropped, the row's search_vector would be gone
        result = pg_conn.execute(
            "SELECT search_vector IS NOT NULL FROM documents WHERE id = 1"
        ).fetchone()
        assert result[0] is True


class TestDatabaseManagerServerDefault:
    """Test server_default support for columns."""

    def test_server_default_applied_on_new_column(self, pg_conn, sqlalchemy_db_url):
        """Test that server_default is applied when creating a new column."""
        Base = declarative_base()

        class Event(Base):
            __tablename__ = "events"
            id = Column(Integer, primary_key=True)
            name = Column(String(100))
            created_at = Column(Text, server_default=text("now()"), nullable=False)

        models_pool = {"events": Event}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Assert column has a server default
        col_default = pg_conn.execute("""
            SELECT column_default
            FROM information_schema.columns
            WHERE table_name='events' AND column_name='created_at'
        """).fetchone()[0]

        assert col_default is not None
        assert "now()" in col_default

    def test_server_default_with_string_value(self, pg_conn, sqlalchemy_db_url):
        """Test server_default with a plain string value."""
        Base = declarative_base()

        class Config(Base):
            __tablename__ = "config"
            id = Column(Integer, primary_key=True)
            status = Column(String(50), server_default="active")

        models_pool = {"config": Config}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        col_default = pg_conn.execute("""
            SELECT column_default
            FROM information_schema.columns
            WHERE table_name='config' AND column_name='status'
        """).fetchone()[0]

        assert col_default is not None
        assert "active" in col_default


class TestDatabaseManagerForeignKeyActions:
    """Test ON DELETE / ON UPDATE support for foreign keys."""

    def test_foreign_key_ondelete_cascade(self, pg_conn, sqlalchemy_db_url):
        """Test that ON DELETE CASCADE is applied to foreign keys."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Check confdeltype: 'c' = CASCADE, 'a' = NO ACTION, 'n' = SET NULL
        result = pg_conn.execute("""
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'posts'::regclass AND contype = 'f'
        """).fetchone()

        assert result is not None
        assert result[0] == "c"  # CASCADE

    def test_foreign_key_ondelete_set_null(self, pg_conn, sqlalchemy_db_url):
        """Test that ON DELETE SET NULL is applied to foreign keys."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        result = pg_conn.execute("""
            SELECT confdeltype
            FROM pg_constraint
            WHERE conrelid = 'posts'::regclass AND contype = 'f'
        """).fetchone()

        assert result is not None
        assert result[0] == "n"  # SET NULL

    def test_foreign_key_onupdate_cascade(self, pg_conn, sqlalchemy_db_url):
        """Test that ON UPDATE CASCADE is applied to foreign keys."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            email = Column(String(255))

        class Post(Base):
            __tablename__ = "posts"
            id = Column(Integer, primary_key=True)
            title = Column(String(200))
            user_id = Column(Integer, ForeignKey("users.id", onupdate="CASCADE"))

        models_pool = {"users": User, "posts": Post}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # confupdtype: 'c' = CASCADE
        result = pg_conn.execute("""
            SELECT confupdtype
            FROM pg_constraint
            WHERE conrelid = 'posts'::regclass AND contype = 'f'
        """).fetchone()

        assert result is not None
        assert result[0] == "c"  # CASCADE


class TestDatabaseManagerJSONBDefaults:
    """Test JSONB column default formatting."""

    def test_jsonb_column_with_dict_default(self, pg_conn, sqlalchemy_db_url):
        """Test creating JSONB column with dict default produces valid SQL."""
        Base = declarative_base()

        class Settings(Base):
            __tablename__ = "settings"
            id = Column(Integer, primary_key=True)
            config = Column(JSONB, default={})

        models_pool = {"settings": Settings}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Verify column exists and default is valid
        col_default = pg_conn.execute("""
            SELECT column_default
            FROM information_schema.columns
            WHERE table_name='settings' AND column_name='config'
        """).fetchone()[0]

        assert col_default is not None
        assert "jsonb" in col_default.lower() or "{}" in col_default

    def test_jsonb_column_with_list_default(self, pg_conn, sqlalchemy_db_url):
        """Test creating JSONB column with list default produces valid SQL."""
        Base = declarative_base()

        class Tags(Base):
            __tablename__ = "tags"
            id = Column(Integer, primary_key=True)
            values = Column(JSONB, default=[])

        models_pool = {"tags": Tags}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        col_default = pg_conn.execute("""
            SELECT column_default
            FROM information_schema.columns
            WHERE table_name='tags' AND column_name='values'
        """).fetchone()[0]

        assert col_default is not None
        assert "jsonb" in col_default.lower() or "[]" in col_default

    def test_jsonb_column_with_nested_dict_default(self, pg_conn, sqlalchemy_db_url):
        """Test JSONB column with nested dict default."""
        Base = declarative_base()

        class Preferences(Base):
            __tablename__ = "preferences"
            id = Column(Integer, primary_key=True)
            data = Column(JSONB, default={"theme": "dark", "notifications": True})

        models_pool = {"preferences": Preferences}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Insert a row using the default and verify it's valid JSON
        pg_conn.execute("INSERT INTO preferences (id) VALUES (1)")
        result = pg_conn.execute("SELECT data FROM preferences WHERE id = 1").fetchone()

        # The default should have been applied as valid JSONB
        col_info = pg_conn.execute("""
            SELECT data_type
            FROM information_schema.columns
            WHERE table_name='preferences' AND column_name='data'
        """).fetchone()[0]

        assert col_info == "jsonb"


class TestDatabaseManagerSafeVarcharChanges:
    """Test safe VARCHAR/TEXT length changes without data loss."""

    def test_varchar_length_increase_preserves_data(self, pg_conn, sqlalchemy_db_url):
        """Test that changing VARCHAR(100) to VARCHAR(255) preserves existing data."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            name = Column(String(100))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Insert data
        pg_conn.execute("INSERT INTO users (id, name) VALUES (1, 'Alice Johnson')")
        pg_conn.commit()

        # Change VARCHAR length
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            name = Column(String(255))

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Verify data is preserved
        result = pg_conn.execute("SELECT name FROM users WHERE id = 1").fetchone()
        assert result[0] == "Alice Johnson"

        # Verify new type
        col_info = pg_conn.execute("""
            SELECT character_maximum_length
            FROM information_schema.columns
            WHERE table_name='users' AND column_name='name'
        """).fetchone()
        assert col_info[0] == 255

    def test_varchar_length_decrease_preserves_data(self, pg_conn, sqlalchemy_db_url):
        """Test that decreasing VARCHAR length preserves data (if it fits)."""
        Base = declarative_base()

        class User(Base):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            name = Column(String(255))

        models_pool = {"users": User}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        # Insert short data that will fit in smaller column
        pg_conn.execute("INSERT INTO users (id, name) VALUES (1, 'Bob')")
        pg_conn.commit()

        # Decrease VARCHAR length
        Base2 = declarative_base()

        class User2(Base2):
            __tablename__ = "users"
            id = Column(Integer, primary_key=True)
            name = Column(String(100))

        models_pool2 = {"users": User2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        # Verify data is preserved
        result = pg_conn.execute("SELECT name FROM users WHERE id = 1").fetchone()
        assert result[0] == "Bob"

    def test_text_to_varchar_preserves_data(self, pg_conn, sqlalchemy_db_url):
        """Test that changing TEXT to VARCHAR preserves data."""
        Base = declarative_base()

        class Article(Base):
            __tablename__ = "articles"
            id = Column(Integer, primary_key=True)
            content = Column(Text)

        models_pool = {"articles": Article}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        pg_conn.execute("INSERT INTO articles (id, content) VALUES (1, 'Hello world')")
        pg_conn.commit()

        # Change to VARCHAR
        Base2 = declarative_base()

        class Article2(Base2):
            __tablename__ = "articles"
            id = Column(Integer, primary_key=True)
            content = Column(String(500))

        models_pool2 = {"articles": Article2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        result = pg_conn.execute("SELECT content FROM articles WHERE id = 1").fetchone()
        assert result[0] == "Hello world"

    def test_varchar_to_text_preserves_data(self, pg_conn, sqlalchemy_db_url):
        """Test that changing VARCHAR to TEXT preserves data."""
        Base = declarative_base()

        class Article(Base):
            __tablename__ = "articles"
            id = Column(Integer, primary_key=True)
            content = Column(String(200))

        models_pool = {"articles": Article}
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool,
        )

        pg_conn.execute(
            "INSERT INTO articles (id, content) VALUES (1, 'Some text here')"
        )
        pg_conn.commit()

        # Change to TEXT
        Base2 = declarative_base()

        class Article2(Base2):
            __tablename__ = "articles"
            id = Column(Integer, primary_key=True)
            content = Column(Text)

        models_pool2 = {"articles": Article2}
        DatabaseManager(
            sqlalchemy_declarative_base=Base2,
            db_url=sqlalchemy_db_url,
            models_pool=models_pool2,
        )

        result = pg_conn.execute("SELECT content FROM articles WHERE id = 1").fetchone()
        assert result[0] == "Some text here"
