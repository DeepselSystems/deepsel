---
name: publish
description: Publish the Python package (deepsel) to PyPI by bumping version, creating a PR, and merging after CI passes
user_invocable: true
---

# Publish Package

Publish the Python `deepsel` package to PyPI via the `auto-publish.yml` workflow that triggers on push to main.

> **Note:** To publish an **npm package** (`@deepsel/cms-utils`, `@deepsel/cms-react`, or `@deepsel/admin`), use `/publish-package` instead.

## Arguments

The user may pass a bump level: `patch` (default), `minor`, or `major`.

## Steps

1. Run `make prepush` to ensure lint, security, format, and tests all pass. If any check fails, fix the errors and try again.
2. Determine the bump level from the user's argument or git changes (default to `patch`).
3. Run `make bump-{level}` to bump the version in pyproject.toml. Capture the new version from the output.
4. Read the new version: `grep '^version = ' pyproject.toml`
5. Create a branch: `git checkout -b bump/v{version}`
6. Stage all changes (including any pending working tree changes) and commit: `git add -A && git commit -m "bump v{version}"`
7. Push the branch: `git push -u origin bump/v{version}`
8. Create a PR to main: `gh pr create --title "bump v{version}" --body "Publish deepsel v{version} to PyPI"`
9. Watch CI: wait for all checks on the PR to pass. If any fail, fix and push again.
10. Merge the PR: `gh pr merge --merge`
11. Report the published version and link: https://github.com/DeepselSystems/deepsel/actions

**Do NOT create git tags.** The `auto-publish.yml` workflow triggers on push to main and publishes to PyPI automatically if the version isn't already there.
