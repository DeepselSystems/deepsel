---
name: data-insertion
description: Create or modify CSV seed data and demo data for backend apps, or themes in the themes folder. Use when asked to add seed data, create demo data, write CSV import files, or set up data.
argument-hint: <app-name> [data|demo_data]
---

# CSV Data Insertion

Create, modify, or troubleshoot CSV seed data files for Deepsel backend apps.

## Arguments

- `$0` — App name (e.g., `cms`, `core`, `locales`)
- `$1` — (optional) `data` for regular seed data, `demo_data` for demo data. Defaults to `data`.

If arguments are missing, ask the user which app and data type they need.

## When to Use

- User asks to add seed/initial data for a model
- User wants to create demo data for an app
- User needs to fix or extend existing CSV import files
- User asks about CSV import format or special column syntax

## Reference

Read `backend/docs/DataInsertion.md` for the full specification. The key details are summarized below.

## File Structure

```
apps/{app_name}/{data|demo_data}/
├── __init__.py          # Contains import_order list
├── model1.csv           # CSV files (filename = model's __tablename__)
├── model2.csv
└── attachments/         # Optional: binary files referenced by CSV
```

## Step-by-Step Workflow

### Step 1: Understand the Target Model

1. Read the model file in `apps/{app_name}/models/` to understand:
   - `__tablename__` (this becomes the CSV filename)
   - Column names, types, and constraints
   - Foreign key relationships
   - Whether the model uses `OrganizationMetaDataMixin` or `BaseModel`
2. Check existing data files in `apps/{app_name}/{data|demo_data}/` for patterns

### Step 2: Create or Update `__init__.py`

The `__init__.py` must contain an `import_order` list. Order matters — parent tables before child tables:

```python
import_order = [
    "parent_model.csv",    # No dependencies
    "child_model.csv",     # Depends on parent_model
]
```

If the file already exists, append new CSVs in the correct dependency order.

### Step 3: Write the CSV File

**Filename**: Must match the model's `__tablename__` (e.g., model with `__tablename__ = "blog_post"` → `blog_post.csv`).

**Required columns**:
- `string_id` — unique identifier (required for regular data, optional for demo data)

**All values must be quoted** except booleans (`true`/`false`).

### Step 4: Handle Special Columns

#### Foreign Key References: `<table>/<field>`
Reference related records by their `string_id`:
```csv
"title","locale/locale_id","page/page_id"
"Home Page","en_US","demo_home_page"
```
Resolves `locale/locale_id` → finds locale with `string_id="en_US"`, uses its `id`.

#### File Content: `file:<field_name>`
Reads file content into a field:
```csv
"string_id","file:translations"
"header","apps/cms/data/header.json"
```

#### File Attachments: `attachment:<field_name>`
Creates an attachment record and stores its ID:
```csv
"string_id","attachment:featured_image_id"
"blog_post_1","apps/cms/demo_data/images/featured.jpg"
```

#### Standalone Attachments
Create `attachments.csv` with `file_path` column:
```csv
"string_id","file_path","alt_text","system"
"hero_banner","apps/cms/data/attachments/hero.jpg","Hero banner",true
```

#### JSON Content: `json:<field_name>`
Parses JSON string into a JSON object. Supports recursive foreign key resolution inside the JSON:
```csv
"string_id","json:translations"
"main_menu","{\"en\": {\"title\": \"Home\", \"page_content/page_content_id\": \"HomePage_en\"}}"
```
The `page_content/page_content_id` key inside the JSON will be resolved to the actual ID.

#### Postgres `ARRAY` Columns
Write a JSON array (or a Postgres array literal) — the loader parses it into a
list and coerces elements to the column's item type:
```csv
"string_id","techs","shift_numbers"
"crew_a","[""Sarah K."", ""Dave M.""]","[1, 2]"
"crew_b","{""Mike R."",""Ann B.""}","{3,4}"
```
An empty cell → NULL (or `[]` on a non-nullable column). A bare unbracketed
value becomes a single-element list.

### Step 5: Verify

1. Check that all referenced `string_id` values exist in their respective CSVs (or will be created by earlier CSVs in the import order)
2. Check that all referenced files exist (for `file:` and `attachment:` columns)
3. Check that JSON strings are valid (for `json:` columns)
4. Verify import order respects foreign key dependencies

## Import Behavior

### Regular Data (`data/`)
- Loaded automatically at startup for all installed apps via `install_seed_data()` from `deepsel`
- Checks for existing records by `string_id`
- Updates only if record has `system=True`
- Skips if record has `system=False` (preserves user changes)
- Creates new if record doesn't exist

### Demo Data (`demo_data/`)

Demo data can be loaded in two ways:

1. **At startup (once)** — `install_seed_data()` (from `deepsel.utils.install_apps`) loads `demo_data/` folders alongside `data/` for all installed apps. It uses a `_demo_data_installed` tracking table in the database to ensure each app's demo data is only imported once. On subsequent restarts the import is skipped.
2. **On demand** — `POST /load_demo_data/{app_name}` (admin UI: Organization → Settings → General → Installed Business Apps → select app → Load demo data). Requires admin privileges. This does **not** check the tracking table, so it can re-insert data.

**Behavior**:
- Always creates new records (no existence check by `string_id`)
- `string_id` is optional
- On-demand loading can cause duplicates if run multiple times (startup loading is protected by the tracking table)

## Default Value Handling

- `organization_id` — auto-assigned to default organization if not specified
- `owner_id` — auto-assigned to default system user if not specified
- Booleans — `"true"`/`"True"`/`"1"` → `True`; `"false"`/`"False"`/`"0"` → `False`

## Common Patterns

### Multilingual content
```csv
"title","slug","locale/locale_id","page/page_id"
"Home Page","home-page","en_US","home"
"Startseite","startseite","de_DE","home"
```

### Blog with featured images
```csv
"string_id","published","attachment:featured_image_id"
"tech_post_1",true,"demo_data/images/tech-featured.jpg"
```

### Menu with nested JSON translations
```csv
"string_id","json:translations"
"main_menu","{\"en\": {\"title\": \"Home\", \"page_content/page_content_id\": \"HomePage_en\", \"use_page_title\": true}, \"de\": {\"title\": \"Startseite\", \"page_content/page_content_id\": \"HomePage_de\", \"use_page_title\": true}}"
```

## Troubleshooting

- **Integrity error on import** — duplicate `string_id` or unique constraint violation. Check for duplicates across CSVs.
- **Missing reference** — the referenced `string_id` doesn't exist. Check import order and that the parent CSV is listed first.
- **File not found** — file path in `file:` or `attachment:` column doesn't exist. Paths are relative to `backend/` root.
- **Invalid JSON** — malformed JSON in `json:` column. Validate the JSON string (watch for escaping: `\"` inside CSV).

## Theme Seed Data

Themes can include seed data in `themes/{theme_name}/data/` using the same CSV format as app data.

### Structure

```
themes/{theme_name}/data/
├── __init__.py      # import_order + optional post_install(db, organization_id)
└── menu.csv
```

A flat `import_order` is sufficient — **do not write a custom importer**. `load_seed_data_for_theme` calls `import_csv_data` per file with `auto_commit=True`, so each file commits before the next runs and cross-file `table/column` FK references resolve without any manual `db.flush()`. A theme needs its own importer only if it also imports images/attachments.

### `post_install(db, organization_id)` Hook

`__init__.py` can define a `post_install` function for non-CSV operations (e.g., configuring site language defaults, updating CMS settings). It receives a SQLAlchemy session plus the organization id, and runs after all CSVs are imported.

```python
import_order = ["menu.csv"]

def post_install(db, organization_id):
    """Custom setup logic after CSV import."""
    # e.g., set default language, configure available languages
    pass
```

**Two arguments, not one.** A one-arg `def post_install(db)` raises `TypeError`, which the caller catches and logs rather than re-raising — the hook silently does nothing while theme selection still reports success. Same for any error inside it: check the backend log if it appears not to have run.

**Copy JSON columns before mutating.** SQLAlchemy doesn't track in-place mutation of a plain `JSON` column, and reassigning the same object never marks it dirty, so the write is dropped:

```python
available = list(org.available_languages or [])   # list(...) is load-bearing
available.append({...})
org.available_languages = available               # new object → dirty → persisted
```

### Loading

Theme seed data is loaded by `load_seed_data_for_theme()` in `deepsel/apps/cms/utils/setup_themes.py` when a theme is selected — either via the `/theme/select` API or when the default theme is set on a fresh DB. It does **not** run on every server restart.

### Iterating on Theme Seed Data

Rows with `system=false` are **skipped when the `string_id` already exists** (that is what preserves user edits), so re-selecting the theme will *not* pick up an edited CSV. Delete the rows first — this also re-exercises the clean-install path, which is what actually ships:

```bash
# children before parents
psql -U <user> -d <db> -c "delete from form_field; delete from form_content; delete from form;"

TOKEN=$(curl -s -X POST localhost:8000/api/v1/token \
  -d 'username=admin&password=1234' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -X POST localhost:8000/api/v1/theme/select \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"folder_name":"<theme>"}'
```

### `page_content` SEO Metadata

No example uses these, which makes them look unavailable. They exist, and they are the whole point for SEO landing pages: `seo_metadata_title`, `seo_metadata_description`, `seo_metadata_allow_indexing`, `seo_metadata_featured_image_id` (or `attachment:seo_metadata_featured_image_id`).

Seed those, not the parallel `draft_seo_metadata_*` set — the draft columns are the admin editor's unpublished working copy.
