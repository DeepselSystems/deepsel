---
name: server-actions
description: Create migration tasks and server startup actions for backend apps. Use when asked to run one-time data migrations, version-specific upgrades, or startup logic
argument-hint: <app-name>
---

# Server Actions & Migration Tasks

Create migration tasks that run at server startup for Deepsel CMS backend apps.

## Arguments

- `$0` — App name (e.g., `cms`, `core`, `locales`)

If not provided, ask the user which app needs the migration.

## When to Use

- Writing a one-time data migration (transform records, fix inconsistencies)
- Adding version-specific upgrade logic
- Running background tasks at server startup

## Key Files

- `settings.py` — holds `version`; bump when adding migrations
- `apps/{app_name}/__init__.py` — define `upgrade()` function or use `@migration_task` decorator
- `server_events.py` — manages server start/stop lifecycle

## Two Approaches

### 1. The `upgrade` Function (simple, runs every startup)

Define in `apps/{app_name}/__init__.py`:

```python
def upgrade(db, from_version, to_version):
    # db: Database session
    # from_version: current version in DB
    # to_version: target version from settings.py
    pass
```

**Important caveats:**
- Runs **every time** the server starts
- The DB version is updated to `to_version` **regardless of success**
- If a migration should only run once, guard it with your own logic (don't rely solely on version)
- Long-running tasks can block the event loop — use `asyncio` or threads

### 2. The `@migration_task` Decorator (version-targeted, runs once)

For migrations that should only run when upgrading to a specific version:

```python
from deepsel.utils.migration_utils import migration_task

@migration_task("Update data format", "1.2.0")
def migrate_data_format(db, app_name, from_version, to_version):
    # Only runs when upgrading to version 1.2.0
    # Supports both sync and async functions
    pass

@migration_task("Process large dataset", "1.3.0")
async def migrate_large_dataset(db, app_name, from_version, to_version):
    # Async migration for heavy operations
    pass
```

**Parameters for decorated functions:**
- `db` — Database session
- `app_name` — Name of the current app
- `from_version` — Previous version
- `to_version` — Target version being upgraded to

**Decorator parameters:**
- `task_title` (str) — Description for logging
- `target_version` (str) — Exact version when this migration runs

**Features:**
- Only runs when upgrading to the exact `target_version`
- Supports sync and async functions
- Automatic version checking and logging
- Prevents duplicate execution

## Step-by-Step Workflow

### Step 1: Check Current Version

Read `settings.py` to find the current `version` value.

### Step 2: Decide Which Approach

- **Runs every startup** → use `upgrade()` function with internal guards
- **Runs once at specific version** → use `@migration_task` decorator

### Step 3: Write the Migration

In `apps/{app_name}/__init__.py`:

```python
from deepsel.utils.migration_utils import migration_task

@migration_task("Description of what this does", "X.Y.Z")
def my_migration(db, app_name, from_version, to_version):
    # Migration logic here
    pass
```

### Step 4: Bump Version

Update `version` in `settings.py` to match the `target_version` in the decorator.

### Step 5: Test

Restart the server and check logs for migration execution messages.

## Background Tasks

For long-running migrations, use async to avoid blocking the event loop:

```python
@migration_task("Heavy data processing", "1.4.0")
async def heavy_migration(db, app_name, from_version, to_version):
    # Use async operations for heavy work
    pass
```

Or spawn background tasks manually in `upgrade()`:

```python
import asyncio

def upgrade(db, from_version, to_version):
    asyncio.create_task(long_running_task(db))
```

**Warning:** Long-running sync tasks in `upgrade()` can block the event loop. Test carefully.

## Example: CMS App

Check `apps/cms/__init__.py` for a working example of the upgrade function with background task usage.
