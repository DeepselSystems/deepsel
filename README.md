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

Authentication (JWT/OAuth/SAML/2FA) and GraphQL are part of the base install — no
extra required. The extras cover pluggable backends and the app-runtime stack:

```bash
pip install deepsel[redis]      # Redis-backed session store
pip install deepsel[s3]         # AWS S3 storage
pip install deepsel[azure]      # Azure Blob storage
pip install deepsel[storage]    # Both S3 and Azure
pip install deepsel[cms]        # CMS support (Jinja2, BeautifulSoup, PyYAML, …)
pip install deepsel[server]     # ASGI server + dotenv (uvicorn, python-dotenv)
```

### Runtime dependencies

`pip install deepsel` pulls the framework's runtime essentials so a server boots
without hunting for modules that only fail at startup:

- **`itsdangerous`** — backs Starlette's `SessionMiddleware` (used by the
  recommended startup wiring and to carry OAuth state).
- **`psycopg[binary]`** — the PostgreSQL driver (`postgresql+psycopg://`).

To actually serve the app you also need an ASGI server, and optionally dotenv-based
config. Install the `server` extra:

```bash
pip install deepsel[server]     # uvicorn[standard] + python-dotenv
```

Auth-stack deps (`authlib`, `python3-saml`/`xmlsec`, `passlib[bcrypt]`, `PyJWT`)
are hard base dependencies and get imported at startup even when `AUTHLESS=true`
(the auth modules are imported by the session store / `get_current_user`), so they
must install cleanly regardless. On macOS the `xmlsec`/`python3-saml` wheels
install without system libs; on Linux CI you may need `libxmlsec1-dev`.

## Quick Start

### Define Models

```python
from sqlalchemy import Column, Integer, String
from deepsel.orm import ORMBaseMixin
from db import Base   # your app's declarative_base — see "Building a Consumer App"

class User(Base, ORMBaseMixin):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)   # ORMBaseMixin does not add a PK
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
```

`ORMBaseMixin` automatically provides `created_at`, `updated_at`, `string_id`, `active`, and `system` fields (but not `id` — declare your own PK), plus built-in query methods for searching, filtering, and pagination. For multi-tenant tables use `BaseModel` (`from deepsel.orm import BaseModel`), which also mixes in `OrganizationMetaDataMixin` (an `organization_id`).

### Automatic CRUD API

```python
from deepsel.deps import configure_deps
from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_CRUD_schemas

# Inject the consumer's Base/sessions once at startup. Auth deps are internal to
# the package — there is no get_current_user param.
configure_deps(
    base=Base,
    get_db_func=get_db,
    get_db_context_func=get_db_context,
    settings_obj=settings,
)

# models_pool must already be populated (scan_and_register_models at startup).
# generate_CRUD_schemas takes the table-name string, not the model class.
schemas = generate_CRUD_schemas("user")     # -> .Read / .Create / .Update / .Search

# CRUDRouter takes a table_name string and individual schema classes.
router = CRUDRouter(
    table_name="user",
    read_schema=schemas.Read,
    search_schema=schemas.Search,
    create_schema=schemas.Create,
    update_schema=schemas.Update,
)
app.include_router(router)
```

This gives you search, create, read, update, and bulk delete endpoints out of the box. Listing is `POST /user/search` — there is no `GET` list route by default (see the route table in [AGENTS.md](AGENTS.md)).

### Authentication

```python
from deepsel.auth import AuthService

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
from deepsel.sqlalchemy import DatabaseManager

db_manager = DatabaseManager(
    sqlalchemy_declarative_base=Base,
    db_url=settings.DATABASE_URL,   # a URL string, not a session factory
    models_pool={"users": User, "products": Product},
)
```

Automatically detects and applies schema changes: new tables/columns, type changes, foreign keys, indexes, enums, and composite keys.

### GraphQL

```python
from deepsel.utils.init_graphql import init_graphql
from deepsel.utils.graphql_schema import AutoGraphQLFactory

factory = AutoGraphQLFactory(models=[User, Product])
schema = factory.create_auto_schema()
init_graphql(app, schema)
```

## Building a Consumer App

A consumer app is a small project that installs `deepsel`, points it at one or
more "apps" (folders of models/routers/data), and lets the framework migrate the
schema, seed data, and mount CRUD routers at startup. Minimal anatomy:

```
myapp/
  main.py            # FastAPI app + lifespan (below)
  settings.py        # env-driven config the framework reads
  db.py              # engine, Base, get_db, get_db_context
  .env
  apps/myapp/
    __init__.py
    models/*.py      # each defines a class with __tablename__
    routers/*.py     # each exposes a module-level `router`
    data/            # __init__.py with import_order = [...]; plus <table>.csv seed files
```

### db.py — the concrete engine/Base/sessions

`deepsel.deps` ships these as `None`; the consumer defines them and injects them
via `configure_deps()`. Models in your app import `Base` from here.

```python
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base
from deepsel.utils.query import Query          # custom Query subclass required
from settings import DATABASE_URL, DB_POOL_SIZE, DB_MAX_OVERFLOW

engine = create_engine(DATABASE_URL, pool_size=DB_POOL_SIZE, max_overflow=DB_MAX_OVERFLOW)
Base = declarative_base()

def get_db():
    db = Session(engine, query_cls=Query)
    try: yield db
    finally: db.close()

@contextmanager
def get_db_context():
    db = Session(engine, query_cls=Query)
    try: yield db
    finally: db.close()
```

### main.py — lifespan wiring (the real startup sequence)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import settings
from db import Base, get_db, get_db_context
from deepsel.deps import configure_deps
from deepsel.sqlalchemy import DatabaseManager
from deepsel.utils.install_apps import install_routers, install_seed_data
from deepsel.utils.models_pool import (
    AppModule, models_pool, resolve_installed_apps, scan_and_register_models)
from deepsel.utils.server_events import on_startup, on_shutdown

@asynccontextmanager
async def lifespan(app: FastAPI):
    app_modules = resolve_installed_apps(
        installed_apps=settings.INSTALLED_APPS, app_dirs=settings.APP_DIRS,
        base_dir=settings._backend_dir)
    configure_deps(base=Base, get_db_func=get_db,
                   get_db_context_func=get_db_context, settings_obj=settings)
    scan_and_register_models(app_modules=app_modules)     # populates models_pool
    DatabaseManager(sqlalchemy_declarative_base=Base, db_url=settings.DATABASE_URL,
                    models_pool=models_pool)              # auto-migrate
    with get_db_context() as db:
        install_seed_data(app_modules=app_modules, db=db)  # import data/*.csv
    from deepsel.auth.session import create_session_store
    app.state.session_store = create_session_store(
        redis_url=settings.REDIS_URL, db_session_factory=get_db_context,
        session_dir=settings.SESSION_DIR, backend=settings.SESSION_STORE_BACKEND)
    install_routers(fastapi_app=app, app_modules=app_modules)  # mount CRUD routers
    yield
    on_shutdown()

app = FastAPI(lifespan=lifespan, docs_url="/" if settings.ENABLE_DOCS else None)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOWED_ORIGIN_REGEX, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"])
app.add_middleware(SessionMiddleware, secret_key=settings.APP_SECRET)
```

**Ordering matters:** `configure_deps` → `scan_and_register_models` (fills
`models_pool`, which routers/schema generation read) → migrate → seed →
`install_routers`. Router modules call `generate_CRUD_schemas("<table>")` at import
time, so they must be imported (by `install_routers`) *after* the pool is filled —
which the sequence above guarantees.

### Always install the `core` app

Even authless apps must install `core` (`INSTALLED_APPS="core, myapp"`). The
authless `get_current_user` looks up the `organization` (id=`DEFAULT_ORG_ID`) and
the `admin_user`, both seeded by `core`. Without `core` the app 401s on every
request.

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
- **App helpers**: `scan_and_register_models()`, `resolve_installed_apps()`, `install_routers()`, `install_seed_data()`, `import_csv_data()`, lifecycle hooks

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
