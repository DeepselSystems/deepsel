---
name: db-model
description: >-
  Design and evolve SQLAlchemy database models in a deepsel/FastAPI backend. Use whenever the user wants to add or modify a table, column.
---

# Database model design

This skill applies to backends built on the in-house `deepsel` framework: FastAPI + SQLAlchemy with auto-discovered models, `BaseModel` mixins, and CSV-driven seed/permissions. Verify the codebase matches before applying these conventions — look for imports from `deepsel`, an `apps/{name}/models/` layout, and a `BaseModel` mixin imported from `deepsel.orm` (or its alias `deepsel.apps.core.mixins.base_model`).

The examples below use a fictional `shop` app with `Product`, `ProductCategory`, and `ProductVariant` — swap in the user's actual app name when scaffolding.

## Before writing anything

1. **Pick the app.** Domain entities go in an existing domain app (not `core`, which is reserved for framework infra: user, org, role, etc.). If unsure which app, ask.
2. **Decide: new model vs. column change.** If the entity is a small enum or a single label on an existing record, a `String` column is usually enough. Don't normalise prematurely.
3. **Confirm names, fields, relationships, and nullability with the user before scaffolding.** Don't invent fields they haven't asked for.

## Naming conventions

| Thing            | Convention                              | Examples                                            |
|------------------|------------------------------------------|-----------------------------------------------------|
| Filename         | `{singular_snake}.py`                    | `product.py`, `product_category.py`                 |
| Class name       | `{PascalSingular}Model`                  | `ProductModel`, `ProductCategoryModel`              |
| `__tablename__`  | `{app}_{singular_snake}`                 | `shop_product`, `shop_product_category`             |
| Foreign-key col  | `{singular}_id`                          | `category_id`, `product_id`                         |

Lowercase, singular, snake_case throughout. The table prefix prevents collisions across apps.

## File layout

```
backend/apps/{app}/
├── models/{name}.py     # SQLAlchemy model
└── schemas/{name}.py    # Pydantic Create/Read/Update
```

`deepsel/utils/models_pool.py`'s `scan_and_register_models()` walks every `apps/{app}/models/*.py` and registers each class with a `__tablename__` (defined in that module). Drop the file in — no registry edits, no `__init__.py` to update.

## The model file

Inherit `Base` (from `db.py`) and `BaseModel` (from `deepsel.orm`).
There is one mixin stack: `deepsel.apps.core.mixins.base_model` /
`.orm` are backwards-compatible aliases of the same classes, so either import
works and the behavior is identical. `BaseModel` is
`ORMBaseMixin + OrganizationMetaDataMixin`, which provides:

| Mixin                         | Fields                                                              |
|-------------------------------|---------------------------------------------------------------------|
| `ORMBaseMixin`                | `created_at`, `updated_at`, `string_id` (unique), `system`, `active`|
| `OrganizationMetaDataMixin`   | `owner_id` (→ `user.id`), `organization_id` (→ `organization.id`, NOT NULL) |

You still **define `id` yourself**:

```python
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric
from sqlalchemy.orm import relationship

from db import Base
from deepsel.orm import BaseModel


class ProductModel(Base, BaseModel):
    __tablename__ = "shop_product"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False, index=True)
    sku = Column(String, nullable=False, unique=True, index=True)
    price = Column(Numeric(12, 2), nullable=False)

    category_id = Column(Integer, ForeignKey("shop_product_category.id"), index=True)
    category = relationship("ProductCategoryModel", back_populates="products")

    variants = relationship(
        "ProductVariantModel",
        back_populates="product",
        cascade="all, delete-orphan",
    )
```

Notes:

- **Default to `nullable=False`** for required fields; omit it for genuinely optional ones (SQLAlchemy's default is nullable).
- **Index foreign keys.** Add `index=True` on FK columns you'll filter by.
- **Arrays of strings** → `from sqlalchemy.dialects.postgresql import ARRAY` + `Column(ARRAY(String), nullable=False, default=list)`.
- **JSON blobs** → `Column(JSON, default=lambda: {...})`. `JSON` and `JSONB` both
  generate `dict | list` schemas, so either can hold arrays — pick `JSONB` when
  you need indexing or containment operators.
- **Relationships**: declare both sides if you want bidirectional access. Use `cascade="all, delete-orphan"` on the parent side **only** when the children genuinely don't exist without the parent.
- **No timestamps needed** — `created_at` / `updated_at` come from the mixin.
- **Do not add `__repr__`** — the mixin already provides one that picks the first of `name | display_name | title | username | email | string_id`.

### When NOT to inherit `BaseModel`

If a model is globally shared (not org-scoped — e.g. `country`, `currency`, `locale`), inherit only `ORMBaseMixin` directly. For ordinary domain entities, default to `BaseModel`.

### Extending another app's model

To add columns to a table another app owns (as `cms` does to `organization`),
subclass it with `__table_args__ = {"extend_existing": True}` — single-table
inheritance, same table:

```python
OrganizationModel = models_pool["organization"]


class ShopSettingsModel(OrganizationModel):
    __table_args__ = {"extend_existing": True}

    currency_code = Column(String(3), default="USD")
```

Rules that follow from this:

- **Never import the extending app's model from the app being extended** (or
  from any app that can run without it). The import always succeeds — the whole
  package ships together — so it silently registers the subclass even when the
  app isn't installed, and its relationships point at tables that were never
  created → the SQLAlchemy mapper registry breaks for *every* model.
- **Reach the extended model through `models_pool["<table>"]`** instead. It holds
  the most-derived subclass, so overridden classmethods dispatch correctly and
  the extension's columns are present when — and only when — that app is
  installed.
- **Put shared behavior on the base mixin**, reading extension columns with
  `getattr` (`OrganizationMixin.find_organization_by_domain` reads `domains`,
  which only cms adds).

## The schema file

Pair each model with Pydantic schemas in `schemas/{name}.py`. The convention is three: `{Name}Read`, `{Name}Create`, `{Name}Update`.

```python
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sku: str
    price: Decimal
    category_id: Optional[int] = None

    # mixin fields — include all of these on Read
    string_id: Optional[str] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class ProductCreate(BaseModel):
    name: str
    sku: str
    price: Decimal
    category_id: Optional[int] = None
    organization_id: Optional[int] = None  # resolved server-side if omitted


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[Decimal] = None
    category_id: Optional[int] = None
    string_id: Optional[str] = None
```

Rules of thumb:

- **`from_attributes=True`** on Read so it hydrates from SQLAlchemy instances.
- **Read** mirrors DB columns + mixin metadata (org/owner/timestamps/string_id/active/system).
- **Create** lists user-supplied fields. `organization_id` is `Optional` because the ORM resolves it — from the authenticated user's `X-Organization-Id`, or from `settings.DEFAULT_ORG_ID` in `AUTHLESS` mode — if absent.
- **Update** = every field `Optional` (no `id`, no timestamps). Always include `string_id` so admins can rename `system=True` seeds.
- **Use `Literal[...]`** for closed enums instead of free strings.

## Modifying an existing model

The framework's migration story is "reconcile from `Base.metadata` on boot" — there's **no Alembic**. That makes additive changes easy and destructive changes manual.

| Change                                                | What to do                                                                                                    |
|-------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| **Add a nullable column**                             | Add it to the model. Boot the server (or `ONLY_MIGRATE=true`). Mirror it in `Read`, `Create` (optional), `Update`. |
| **Add a NOT NULL column with default**                | Same as above, but include `default=...` / `server_default=...` so existing rows get a value.                 |
| **Add a NOT NULL column with no default**             | Two steps: (1) add nullable + backfill data; (2) flip to `nullable=False`. Discuss with the user.             |
| **Add a new FK**                                      | New column + `relationship()` on both sides. Update Read/Create/Update schemas. Index the FK column.          |
| **Rename a column**                                   | DatabaseManager will *not* migrate data — you'd lose the column's contents. Write a one-off SQL script, or in dev confirm it's OK to drop/recreate. Always ask the user. |
| **Change a column type**                              | Same caveat. Safe widenings (e.g. `String(120)` → `String(255)`) generally work; type changes (Int → String, narrowing, etc.) need manual SQL. Ask. |
| **Drop a column / table**                             | Destructive. Confirm with the user, then either write a manual `ALTER TABLE` / `DROP TABLE`, or in dev drop the table and let DatabaseManager recreate. |
| **Add a relationship without a new column**           | Just add the `relationship(...)` declarations on both sides — no schema change.                               |
| **Change `nullable`, `unique`, `index`, server defaults** | DatabaseManager may or may not pick these up; verify in psql afterwards and patch with manual SQL if needed.  |
| **Add a value to an enum** | Just add it to the Python enum — DatabaseManager issues `ALTER TYPE ... ADD VALUE` on boot. **Removing/renaming** a value is manual SQL (Postgres limitation) — migrate data off the value first, then recreate the type. |

For any non-additive change, **confirm with the user before running it on anything but local dev** — there is no rollback.

You can dry-run migrations by setting `ONLY_MIGRATE=true` in the backend env: it runs migrations and exits without starting the server.

## Seed data (optional)

If the model needs initial rows, use the `/data-insertion` skill — it covers CSV format, `import_order`, special column syntaxes (`<table>/<fk_field>`, `file:`, `attachment:`, `json:`), and the regular-vs-demo import behaviour.

## Role permissions

Access to a table is granted via the `role` table, seeded from `role.csv` files. Permission strings are `table:action:scope`:

- `table` = `__tablename__` (e.g. `shop_product`)
- `action` ∈ `read`, `write`, `*`
- `scope` ∈ `own`, `org`, `*`

The importer scans every installed app's `data/` folder, so an app can ship its own roles in `apps/{app}/data/role.csv` rather than editing core's. Same for `implied_role.csv`. Role rows are `system=true` and re-overwritten from CSV on each boot — edit the CSV, don't poke the DB.

### Where to put the permission

For each new model, decide between three options:

1. **Extend an existing role** in the current app — when the table is a natural extension of an existing area and the role's purpose still fits. E.g. add `shop_product:read:org` to an existing `shop_viewer_role`.
2. **Create a new app-specific role** in `apps/{app}/data/role.csv` — when the model represents a new domain capability that deserves its own grant. E.g. a `product_manager_role` that gets `shop_product:*:org`, `shop_product_category:*:org`, `shop_product_variant:*:org`.
3. **Add to `admin_role` in core** — only for tables that should be admin-only (e.g. audit logs, system config).

Avoid sprinkling permissions across many unrelated roles. Group by capability.

### Implied roles

`implied_role` is a self-join on `role`: if a user has `role_id`, they implicitly also have `implied_role_id`. Use it to chain roles so administrators don't need to be manually granted every new app-specific role.

Pattern: when you create a new app role, also add an implied-role row so `admin_role` implies it. That way `admin_role` users get the new capability for free.

`apps/{app}/data/implied_role.csv`:

```csv
string_id,role/role_id,role/implied_role_id
imply_admin_product_manager,admin_role,product_manager_role
```

Reads as: holding `admin_role` implies holding `product_manager_role`. Chain further if the new role itself should imply a lower-privileged one (e.g. `product_manager_role` implies `product_viewer_role`).

Add `role.csv` and `implied_role.csv` to the app's `data/__init__.py` `import_order` — `role.csv` before `implied_role.csv`, since the latter references the former by `string_id`.

## Extending CRUD behavior

Override these classmethods on your model (call `super()`) for side effects,
computed fields, or denormalized snapshots:

| Method | Purpose |
|---|---|
| `create(cls, db, user, ...)` | Run logic after insert (e.g. update search vectors, generate sequence numbers) |
| `update(cls, db, user, item_id, ...)` | Run logic after update |
| `delete(cls, db, user, item_id, ...)` | Run logic after delete |
| `search(cls, db, user, ...)` | Custom filtering / aggregation |
| `_resolve_organization_on_create()` | Override org resolution (default: explicit org the user may target → `current_organization_id` → `DEFAULT_ORG_ID` when `AUTHLESS`, for users who may target it) |

Canonical example: `deepsel/apps/cms/models/page_content.py` (overrides
`create`/`update` to rebuild a `TSVector` search column).

## Settings / singleton records

For app settings, prefer a dedicated per-org single-row table over adding columns
to `organization`: a `BaseModel` table with
`UniqueConstraint("organization_id")`, one seeded row in `data/<table>.csv`
(`system=false` so user edits survive re-import), and a `CRUDRouter` with
`create_route=False, delete_one_route=False, bulk_delete_route=False,
import_route=False`. The frontend reads with `POST /<table>/search` and writes
with `PUT /<table>/{id}`. Only put a setting on `organization` when the framework
must read it (like `enable_auth`, mail config).

## Full-text search

The framework has no built-in FTS operator, but the CMS app contains a reusable
pattern:

1. Add `search_vector = Column(TSVector)` — import `TSVector` from
   `deepsel.apps.cms.utils.tsvector` (or copy the 15-line `TypeDecorator` to avoid
   depending on CMS).
2. Add a GIN index in `__table_args__`:
   `Index("idx_<table>_search_vector", "search_vector", postgresql_using="gin")`.
3. Override `create()` and `update()` to call a `_update_search_vector(db, record)`
   staticmethod after `super()` — see `page_content.py` for the
   `setweight(to_tsvector('simple', ...))` SQL.
4. Expose search via a custom router endpoint using `func.to_tsquery` — CRUDRouter
   search DSL cannot express tsquery matches. Build safe prefix queries with the
   `_build_prefix_tsquery` approach in `deepsel/apps/cms/utils/search.py`.
5. If rows already exist, add a `@migration_task` to backfill vectors (and
   `CREATE EXTENSION IF NOT EXISTS pg_trgm` if using trigram fallback).

## Final checklist

- [ ] Model file exists at `models/{name}.py` (and `schemas/{name}.py` if the model is exposed via API)
- [ ] Model has explicit `id = Column(Integer, primary_key=True)` and inherits `Base, BaseModel`
- [ ] `__tablename__` follows `{app}_{singular}` convention
- [ ] FKs have `index=True` and matching `relationship()` declarations
- [ ] Schemas are in sync with the model (Read includes all columns + mixin fields; Create lists writable fields; Update has every field optional)
- [ ] For non-additive schema changes, the user has explicitly confirmed
- [ ] If seed data: CSV filename matches table name, `import_order` updated
- [ ] If permissions needed: appropriate roles in `role.csv` updated
- [ ] Backend boots cleanly (or `ONLY_MIGRATE=true` returns success)

Don't add tests, factories, or admin UI unless the user asks.
