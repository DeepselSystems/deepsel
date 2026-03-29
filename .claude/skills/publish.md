---
description: Publish this package to PyPI by bumping version, committing, tagging, and pushing
user_invocable: true
---

# Publish Package

Publish deepsel to PyPI via the GitHub Actions tag-push workflow.

## Arguments

The user may pass a bump level: `patch` (default), `minor`, or `major`.

## Steps

1. Run `make prepush` to ensure lint, security, format, and tests all pass. If any check fails, fix the errors and try again.
2. Determine the bump level from the user's argument or git changes (default to `patch`).
3. Run `make bump-{level}` to bump the version in pyproject.toml. Capture the new version from the output.
4. Read the new version: `grep '^version = ' pyproject.toml`
5. Stage and commit: `git add pyproject.toml && git commit -m "bump v{version}"`
6. Tag: `git tag v{version}`
7. Push commit and tag: `git push && git push --tags`
8. Report the published version and link: https://github.com/DeepselSystems/deepsel-core/actions
