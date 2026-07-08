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

### Consumer App Conventions

An "app" is a folder resolved from `INSTALLED_APPS` against `APP_DIRS`
(comma-separated; local dirs like `apps` are tried against `base_dir`, then
dotted paths like `deepsel.apps`). Each app is a Python package (`__init__.py`
required) with these auto-discovered pieces:

- **`models/*.py`** — every `.py` (except `__init__.py`) is imported;
  `scan_and_register_models()` registers each class that has `__tablename__`
  **and is defined in that module** (`cls.__module__ == module.__name__`) into
  the global `models_pool`, keyed by `__tablename__`. Define models as
  `class FooModel(Base, ORMBaseMixin)` importing `Base` from your consumer
  `db.py`. (The built-in `example` app uses a `create_*_model(base)` factory +
  `register_models(base)` instead — but note that path is **not** what
  `scan_and_register_models` invokes; the plain class-with-`__tablename__` form is
  the one the scanner picks up.)
- **`routers/*.py`** — every `.py` (except `__init__.py`) is imported and its
  **module-level `router`** is mounted via `include_router`. ⚠️ Do **not** put
  helper modules without a `router` attribute in `routers/` — `install_routers`
  does `module.router` unconditionally and will `AttributeError`. Put shared
  helpers elsewhere in the app package.
- **`data/__init__.py`** — must define `import_order = ["<table>.csv", ...]`;
  those CSVs are imported on startup (see Seed CSV format). `demo_data/` works the
  same but is gated by a `_demo_data_installed` table.

**Model field conventions:**

- `ORMBaseMixin` auto-adds `created_at`, `updated_at`, `string_id` (unique),
  `system` (bool), `active` (bool). It does **not** add `id` — declare your own PK.
- `BaseModel = ORMBaseMixin + OrganizationMetaDataMixin`. Use plain `ORMBaseMixin`
  for **non-tenant** tables (no `organization_id`).
- If a model has `organization_id`, it becomes **tenant-scoped**: create requires
  an org (from the `X-Organization-Id` header, via `user.current_organization_id`)
  and seed CSVs must provide/accept an org (see below). If it has `owner_id`,
  create forces `owner_id = user.id`.
- Enums: `class Foo(str, enum.Enum)` with value == the string you'll use in
  seed CSVs and API filters; column `Column(Enum(Foo))`.

### Permissions (applies even in AUTHLESS mode)

Permission strings are `"<table>:<action>:<scope>"` where action ∈
`read|write|delete|create|*` and scope ∈ `own|org|*`. Matching is by **exact table
name** — `*` is valid for action/scope but **not** for the table segment. So a
role must list every table it can touch.

`AUTHLESS=true` does not bypass permissions: requests run as the seeded
`admin_user` (via `get_current_user`), and that user's `admin_role` only grants
the **core** tables. Your consumer tables will 403 until you grant them. Grant by
shipping a seed `data/role.csv` in your app that re-imports `admin_role` (it is a
`system=true` row, so it force-updates) with the full permission list including
your tables, e.g. `"mytable:*:*"`. Because updates **replace** the permissions
column (not merge), include the original core permissions too.

For **non-tenant** tables, use scope `*` (`mytable:*:*`) so the scope-based query
filter returns rows unrestricted (`own`/`org` scopes filter by `owner_id` /
`organization_id`, which non-tenant tables lack → they match nothing / fail closed).

### Seed CSV format (`data/*.csv`)

One CSV per table, filename = `<table_name>.csv`, listed in `data/__init__.py`'s
`import_order`. Rows are matched/deduped by `string_id`, so:

- A **`string_id` column is required** on every non-demo seed CSV (loader raises
  otherwise). Re-running import is idempotent by `string_id`.
- **Quote any field containing a comma** (standard CSV). An unquoted comma shifts
  columns and the loader crashes with `argument of type 'NoneType' is not iterable`
  (a `None` key from `csv.DictReader`'s restkey).
- **Empty cells are NOT auto-nulled** except for `DateTime` columns. An empty
  string in an `Integer`/FK cell reaches Postgres as `""` →
  `invalid input syntax for type integer: ""`. Write the literal `None` (the
  loader converts the string `"None"` → SQL NULL) for empty int/FK cells.
- Booleans: `true`/`false`/`True`/`False` are converted.
- **Do NOT hard-code integer PKs (`id`) in seed CSVs.** Setting explicit ids does
  not advance the Postgres identity sequence, so the first API `POST` collides with
  `Key (id)=(1) already exists`. Omit `id` and let it autoincrement.
- **Foreign keys by string_id:** use a `related_table/fk_column` header, e.g.
  `conversation/conversation_id`, and put the target row's `string_id` as the
  value; the loader resolves it to the numeric id. This is how to seed relations
  without knowing numeric ids. Empty value (or `None`) leaves the FK null.
- Tenant-scoped tables (`organization_id`): either include an `organization_id` /
  `organization/organization_id` column, or the loader installs the row into every
  org. Non-tenant tables install once.

### CRUDRouter generated routes

For `table_name="foo"` (prefix `"{API_PREFIX}/foo"`), enabled routes:

| Route | Method | Path | Default |
|---|---|---|---|
| search | POST | `/foo/search` | on |
| create | POST | `/foo` | on |
| get_one | GET | `/foo/{item_id}` | on |
| update | PUT | `/foo/{item_id}` | on |
| delete_one | DELETE | `/foo/{item_id}` | on |
| bulk_delete | POST | `/foo/bulk_delete` | on |
| export | POST | `/foo/export` | on (CSV) |
| import | POST | `/foo/import` | on (CSV upload) |
| get_all | GET | `/foo` | **off** |

Toggle each via constructor kwargs (`search_route=False`, etc.). Note **no list
route by default** — listing is `POST /foo/search`.

**Search request shape** (the non-obvious part): `search` and `order_by` are body
object keys; `skip`/`limit` are query params:

```
POST /api/v1/foo/search?skip=0&limit=50
{ "search":   { "AND": [ {"field":"status","operator":"=","value":"delivered"} ], "OR": [] },
  "order_by": { "field": "created_at", "direction": "asc" } }
```

Response: `{ "total": <int>, "data": [ <Read>, ... ] }`. Sending the SearchQuery
at the top level (`{"AND":[...]}`) is silently ignored → all rows returned.

**Update:** the auto-generated Update schema keeps non-nullable columns
**required**, so a partial `PUT {"status":"x"}` is rejected by validation even
though the handler applies only sent fields (`exclude_unset=True`). For partial
patches, pass a custom all-optional `update_schema`.

**get_one on a missing id returns 403**, not 404 (permission-scoped query matches
nothing → "no permission").

## Publishing

**Python (PyPI):** tags matching `v*.*.*` trigger the publish workflow to PyPI via trusted publishing (OIDC). Use `make bump-*` to update the version, commit, tag, and push.

**JavaScript (npm):** each package publishes via its own namespaced tag with provenance (gated on `github.repository_owner == 'DeepselSystems'`):

- `admin-v*` → `publish-admin.yml` → `@deepsel/admin`
- `cms-utils-v*` / `cms-react-v*` → `publish-packages.yml` → `@deepsel/cms-utils` / `@deepsel/cms-react`

CI: `test-package.yml` (test/lint/format/build for cms-utils & cms-react) and `test-admin.yml` (test + library build for admin) run on PRs touching `packages/**`. These are independent of the Python `test.yml`/`publish.yml`.

## Code Style

- Python 3.12+, Black (88 chars), flake8, bandit
- Pydantic v2 for validation, SQLAlchemy 2.0 style
