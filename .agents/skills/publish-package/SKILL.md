---
name: publish-package
description: Publish an npm package (@deepsel/cms-utils, @deepsel/cms-react, or @deepsel/admin).
argument-hint: <package-name> [version]
user_invocable: true
---

# Publish Package

Format, validate, tag, and push a tag for an npm package so GitHub Actions can publish it.

## Arguments

- `$0` — Package name: `cms-utils`, `cms-react`, or `admin`
- `$1` — (Optional) Version to publish, e.g. `1.6.0`. If omitted, read from the package's `package.json`.

If no package name is provided, ask the user which package to publish.

> **Note:** To publish the **Python package** (`deepsel`) to PyPI, use `/publish` instead.

## Package Map

| Name | Workspace | Tag format | package.json path | Workflow |
|------|-----------|------------|-------------------|----------|
| `cms-utils` | `packages/cms-utils` | `cms-utils-v{version}` | `packages/cms-utils/package.json` | `publish-packages.yml` |
| `cms-react` | `packages/cms-react` | `cms-react-v{version}` | `packages/cms-react/package.json` | `publish-packages.yml` |
| `admin` | `packages/admin` | `admin-v{version}` | `packages/admin/package.json` | `publish-admin.yml` |

## Dependency Order

`cms-utils` is the root of the dep tree. Both `cms-react` and `admin` depend on `@deepsel/cms-utils`.
If publishing `cms-react`, build `cms-utils` first.
If publishing `admin`, build `cms-utils` first.

## Consumer Map

When a package is published, update the version in all consumers that depend on it.
Only update dependencies that use a caret range (e.g. `^1.9.12`). Skip `"*"` — it already matches everything.

| Published package | Consumers to update |
|-------------------|---------------------|
| `cms-utils` | `packages/cms-react/package.json` (caret). `packages/admin` uses `"*"` — skip. |
| `cms-react` | *(none in this repo)* |
| `admin` | *(none)* |

## Workflow

### Step 1 — Resolve version

1. If the user provided a version argument, use it and skip to step 5.
2. Otherwise read the version from the package's `package.json`.
3. Check if that version is already published on npm: `npm view @deepsel/{package} version 2>/dev/null`
4. If the version in `package.json` is already published, auto-bump:
   - Look at changes since the last publish tag (`git log --oneline {tag}..HEAD -- packages/{name}/src/`) and unstaged changes (`git diff HEAD -- packages/{name}/src/`).
   - **major** — breaking API changes (removed exports, renamed public functions, changed return types)
   - **minor** — new features (new exports, new functions, new options)
   - **patch** — bug fixes, internal refactors, docs
   - Bump the version in `package.json` accordingly using semver rules.
5. If the user provided a version that differs from `package.json`, update `package.json` to match.
6. Confirm the version with the user before proceeding: "Publishing **{package}** v{version} — continue?"

### Step 2 — Format

Run formatting for the target package:

```bash
npm run format --workspace=packages/{name}
```

### Step 3 — Prepush checks

Run the full check pipeline for the target package (tests, linting, format check, build). These mirror CI.

```bash
# For cms-utils:
npm run prepush --workspace=packages/cms-utils

# For cms-react (must build cms-utils first):
npm run build --workspace=packages/cms-utils
npm run prepush --workspace=packages/cms-react

# For admin (no `prepush` script — mirror test-admin.yml: test + library build):
npm run build --workspace=packages/cms-utils
npm run format:check --workspace=packages/admin
npm test --workspace=packages/admin
npm run build:lib --workspace=packages/admin
```

> Note: admin's eslint is not wired into CI and reports pre-existing warnings/errors, so admin does not gate on lint. Only `cms-utils`/`cms-react` gate on lint via their `prepush`.

### Step 4 — Fix issues

If any step in prepush fails:

1. Read the error output carefully.
2. Fix the issue (lint errors, test failures, type errors, formatting).
3. Re-run the failing step to confirm the fix.
4. Repeat until prepush passes cleanly.

Do NOT skip or ignore failures. Every check must pass.

### Step 5 — Update consumers

Update all consumer `package.json` files listed in the **Consumer Map** above:

1. For each consumer, update the dependency version to `^{version}` (e.g. `"@deepsel/cms-utils": "^1.9.13"`).
2. Skip dependencies set to `"*"` — leave them as-is.
3. Run `npm install` from the repo root to update the lockfile.

### Step 6 — Stage and commit all changes

If any files were changed in Steps 2-5 (fixes, version bump, consumer updates):

1. Stage the changed files: the package's `package.json`, any consumer `package.json` files, `package-lock.json`, and any code fixes.
2. Commit with message: `fix: prepare {package} v{version} for publish`
3. Do NOT push the commit to remote. The user will push main when ready.

### Step 7 — Create and push the tag

```bash
# Create annotated tag
git tag -a {package}-v{version} -m "{package} v{version}"

# Push ONLY the tag, not main
git push origin {package}-v{version}
```

### Step 8 — Verify

1. Confirm the tag was pushed: `git ls-remote --tags origin | grep {package}-v{version}`
2. Tell the user:
   - Tag `{package}-v{version}` pushed — GitHub Actions will publish to npm.
   - Remind them to push main when ready: `git push origin main`
   - Link to check CI: `https://github.com/DeepselSystems/deepsel/actions`

## Important

- **Never push main** — only push the tag.
- **Never skip prepush checks** — the same checks run in CI, so failing locally means CI will also fail.
- **Never use `--no-verify`** when committing.
- **Never amend a commit after its tag has been pushed.** Pushing a tag triggers CI. Deleting and re-pushing the same tag triggers CI again, causing duplicate publish failures. If you forgot something in the commit, make a new commit — do NOT amend + retag.
- If the tag already exists, ask the user whether to delete and recreate it or pick a different version.
