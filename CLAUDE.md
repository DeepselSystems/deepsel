# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Deepsel is a Python framework (PyPI package) for building data-driven applications with FastAPI and SQLAlchemy. It provides ORM mixins, automatic CRUD API generation (REST + GraphQL), multi-tenancy, authentication (JWT/OAuth/SAML/2FA), and pluggable storage (S3/Azure).

## Commands

```bash
make install-dev      # Install with all dev/optional dependencies
make test             # Run pytest with coverage
make lint             # Flake8 (ignores E501, F401, and others - see Makefile)
make format           # Black formatter (line length 88)
make security         # Bandit security scan
make prepush          # All checks: lint → security → format-check → test → build
make bump-patch       # Bump version in pyproject.toml (also bump-minor, bump-major)
```

Run a single test file: `pytest tests/test_foo.py -v`
Run a single test: `pytest tests/test_foo.py::test_function_name -v`

## Architecture

### Module Structure

- **`deepsel/orm/`** — ORM layer built on SQLAlchemy 2.0
  - `mixin.py` — `ORMBaseMixin`: core query/filter/pagination methods, auto-fields (created_at, updated_at, string_id, active, system)
  - `base_model.py` — `BaseModel` combines ORMBaseMixin + OrganizationMetaDataMixin
  - Feature mixins: `UserMixin`, `OrganizationMixin`, `AttachmentMixin`, `EmailTemplateMixin`, `CronMixin`, `ActivityMixin`
  - `types.py` — Operator, SearchCriteria, SearchQuery, OrderDirection, PermissionScope enums

- **`deepsel/auth/`** — AuthService (JWT/passwords/2FA), GoogleOAuthService, SamlService

- **`deepsel/sqlalchemy/`** — `DatabaseManager` for automatic schema migration (detects table/column/constraint changes and applies them)

- **`deepsel/utils/`** — Public API surface
  - `crud_router.py` — `CRUDRouter`: auto-generates FastAPI endpoints from ORM models
  - `generate_crud_schemas.py` — Generates Pydantic schemas from SQLAlchemy models
  - `graphql_schema.py` — `AutoGraphQLFactory` for Strawberry GraphQL
  - `storage.py` — S3Client, AzureBlobClient
  - `send_email.py` / `email_doser.py` — Rate-limited email sending
  - `install_apps.py` — Router installation, seed data, CSV import helpers

### Key Patterns

- **Lazy imports**: `__init__.py` files use `__getattr__` to defer imports of optional dependencies (auth, graphql, storage). This avoids requiring all extras at install time.
- **Mixin composition**: ORM models inherit from `BaseModel` which combines multiple mixins. Feature mixins (User, Organization, etc.) are applied selectively by consumer projects.
- **Tests use testcontainers**: PostgreSQL is spun up via testcontainers in `conftest.py` — no external DB setup needed.

## Publishing

Tags matching `v*.*.*` trigger the GitHub Actions publish workflow to PyPI via trusted publishing (OIDC). Use `make bump-*` to update the version, commit, tag, and push.

## Code Style

- Python 3.12+, Black (88 chars), flake8, bandit
- Pydantic v2 for validation, SQLAlchemy 2.0 style
