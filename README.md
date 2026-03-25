# Deepsel

A full-featured Python framework for building data-driven applications with FastAPI and SQLAlchemy. Provides an ORM layer with built-in CRUD, multi-tenancy, authentication, automatic API generation (REST + GraphQL), and more.

## Packages

- **deepsel.orm** - Declarative ORM with base models, mixins, and advanced query support
- **deepsel.sqlalchemy** - Automatic database schema migration and management
- **deepsel.auth** - Authentication (JWT, OAuth, SAML, 2FA)
- **deepsel.utils** - CRUD routers, schema generation, GraphQL, storage clients, email, encryption

## Installation

```bash
pip install deepsel
```

### Optional Dependencies

```bash
pip install deepsel[auth]       # JWT, password hashing, 2FA
pip install deepsel[oauth]      # Google OAuth
pip install deepsel[saml]       # SAML authentication
pip install deepsel[s3]         # AWS S3 storage
pip install deepsel[azure]      # Azure Blob storage
pip install deepsel[storage]    # Both S3 and Azure
pip install deepsel[graphql]    # GraphQL support via Strawberry
```

## Quick Start

### Define Models

```python
from deepsel import BaseModel
from sqlalchemy import Column, String

class User(BaseModel):
    __tablename__ = "users"

    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
```

`BaseModel` automatically provides `created_at`, `updated_at`, `string_id`, `active`, and `system` fields, plus built-in query methods for searching, filtering, and pagination.

### Automatic CRUD API

```python
from deepsel import CRUDRouter, generate_CRUD_schemas, configure_crud_router

# Configure dependencies
configure_crud_router(db_session_factory=get_db, auth_dependency=get_current_user)

# Generate Pydantic schemas from your ORM model
schemas = generate_CRUD_schemas(User)

# Create a router with full CRUD endpoints
router = CRUDRouter(model=User, schemas=schemas)
app.include_router(router)
```

This gives you paginated list, search, create, read, update, and bulk delete endpoints out of the box.

### Authentication

```python
from deepsel import AuthService

auth = AuthService(secret_key="your-secret-key")

# JWT tokens
token = auth.create_token(user_id=123)
payload = auth.decode_token(token)

# Password hashing
hashed = auth.hash_password("my_password")
```

Also supports Google OAuth (`GoogleOAuthService`), SAML (`SamlService`), and 2FA with recovery codes.

### Database Migrations

```python
from deepsel import DatabaseManager

db_manager = DatabaseManager(
    sqlalchemy_declarative_base=Base,
    db_session_factory=get_db,
    models_pool={"users": User, "products": Product}
)
```

Automatically detects and applies schema changes: new tables/columns, type changes, foreign keys, indexes, enums, and composite keys.

### GraphQL

```python
from deepsel import init_graphql, AutoGraphQLFactory

factory = AutoGraphQLFactory(models=[User, Product])
schema = factory.create_auto_schema()
init_graphql(app, schema)
```

## ORM Mixins

Extend your models with feature-rich mixins:

| Mixin | Description |
|---|---|
| `UserMixin` | User authentication, roles, permissions, email |
| `OrganizationMixin` | Multi-tenant organization management |
| `AttachmentMixin` | File uploads with pluggable storage (S3, Azure, local) |
| `EmailTemplateMixin` | Email template management |
| `CronMixin` | Scheduled task execution |
| `ActivityMixin` | Field-level change tracking and audit logs |

## Query & Search

Built-in support for complex queries with AND/OR logic, operators (`eq`, `ne`, `in_`, `contains`, `between`, `like`, `ilike`, `gt`, `lt`, etc.), permission scoping (`own`, `org`, `all`), and ordering.

## Utilities

- **Storage**: S3 and Azure Blob clients with filename sanitization
- **Email**: Rate-limited email sending via `fastapi-mail`
- **Encryption**: `encrypt()`/`decrypt()`, password hashing, recovery code generation
- **App helpers**: `install_routers()`, `install_seed_data()`, `import_csv_data()`, lifecycle hooks

## Supported Databases

- PostgreSQL (primary support)

## Development

```bash
make install-dev    # Install with dev dependencies
make test           # Run tests with coverage
make lint           # Run flake8
make security       # Run bandit security checks
make format         # Format with black
make prepush        # Run all checks before pushing
make build          # Build distribution packages
```

## License

MIT License - see LICENSE file for details.
