# AGENTS.md

This file provides guidance to AI agents when working with this repository.

Note that 
 -  CLAUDE.md is symlinked to AGENTS.md
 - .claude is symlinked to .agents folder
So any edits should be made in the original AGENTS.md file and .agents folder.

## What This Is

Deepsel is a Python framework (PyPI package) for building data-driven applications with FastAPI and SQLAlchemy. It provides ORM mixins, automatic CRUD API generation, multi-tenancy, authentication (JWT/OAuth/SAML/2FA), and pluggable storage (S3/Azure).

This repo is a **polyglot monorepo**: the Python framework lives at the root (`deepsel/`, published to PyPI as `deepsel`), and the CMS frontend JavaScript libraries live under `packages/` as npm workspaces (published to npm under the `@deepsel` scope). The two ecosystems build and publish independently. The CMS Python backend + MCP are expected to migrate here in a later phase.

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

### JavaScript packages (`packages/`)

npm workspaces (root `package.json`, `workspaces: ["packages/*"]`). Node 22.x for tests, 24.14.1 for publish. The three published packages:

- **`packages/cms-utils`** (`@deepsel/cms-utils`) — TS utilities/types; no local deps (root of the dep tree).
- **`packages/cms-react`** (`@deepsel/cms-react`) — React components/theme lib; depends on `@deepsel/cms-utils`.
- **`packages/admin`** (`@deepsel/admin`) — React admin UI (Vite library build); depends on `@deepsel/cms-utils`.

```bash
npm install                                   # install + link workspaces (run from repo root)
npm run build:packages                        # build cms-utils then cms-react
npm run build:admin                           # build the admin Vite library
npm test --workspace=@deepsel/cms-utils       # per-package: test | lint | format | format:check
npm run format:check                          # prettier check across all three
```

Note: `react`/`react-dom` are anchored in the root `package.json` devDependencies (the `$react` overrides reference them); they were previously provided by the (not-yet-migrated) Astro client. The admin package's eslint is not wired into CI and currently reports pre-existing warnings/errors — only cms-utils/cms-react gate on lint.

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
  - `models_pool.py` — Global model registry, `resolve_installed_apps()` for resolving app modules from `installed_apps`/`app_dirs` config, `scan_and_register_models()` for automatic model registration
  - `install_apps.py` — Router installation, seed data, CSV import helpers

### Key Patterns

- **Lazy imports**: `__init__.py` files use `__getattr__` to defer imports of optional dependencies (auth, graphql, storage). This avoids requiring all extras at install time.
- **Mixin composition**: ORM models inherit from `BaseModel` which combines multiple mixins. Feature mixins (User, Organization, etc.) are applied selectively by consumer projects.
- **Tests use testcontainers**: PostgreSQL is spun up via testcontainers in `conftest.py` — no external DB setup needed.

## Publishing

**Python (PyPI):** tags matching `v*.*.*` trigger the publish workflow to PyPI via trusted publishing (OIDC). Use `make bump-*` to update the version, commit, tag, and push.

**JavaScript (npm):** each package publishes via its own namespaced tag with provenance (gated on `github.repository_owner == 'DeepselSystems'`):

- `admin-v*` → `publish-admin.yml` → `@deepsel/admin`
- `cms-utils-v*` / `cms-react-v*` → `publish-packages.yml` → `@deepsel/cms-utils` / `@deepsel/cms-react`

CI: `test-package.yml` (test/lint/format/build for cms-utils & cms-react) and `test-admin.yml` (test + library build for admin) run on PRs touching `packages/**`. These are independent of the Python `test.yml`/`publish.yml`.

## Code Style

- Python 3.12+, Black (88 chars), flake8, bandit
- Pydantic v2 for validation, SQLAlchemy 2.0 style
