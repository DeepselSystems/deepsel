---
name: publish-package
description: Publish an npm package (@deepsel/cms-utils, @deepsel/cms-react, or @deepsel/admin).
argument-hint: <package-name> [version]
user_invocable: true
---

# Publish Package

Bump the version, open a PR, and merge it. CI publishes on merge to `main` — do **not** create tags.

## Arguments

- `$0` — `cms-utils`, `cms-react`, or `admin`. Ask if omitted.
- `$1` — (Optional) version, e.g. `1.13.0`. If omitted, bump from `package.json`.

> Python package (`deepsel`) → use `/publish` instead.

## Package Map

| Name | Workspace | Consumers to bump |
|------|-----------|-------------------|
| `cms-utils` | `packages/cms-utils` | `packages/cms-react` (caret). `packages/admin` uses `"*"` — skip. |
| `cms-react` | `packages/cms-react` | `packages/admin` uses `"*"` — skip. |
| `admin` | `packages/admin` | none |

`cms-utils` is the root of the dep tree — build it before `cms-react` or `admin`.

## Steps

1. **Version** — If the user gave one, use it. Else read `package.json`, check `npm view @deepsel/{name} version`, and if already published bump by semver: **major** breaking, **minor** new exports/features, **patch** fixes/refactors.

   Bump **every** package whose `src/` you touched, not just the target — the `check-versions` CI job fails the PR on any package with changed sources and an unchanged version.

2. **Branch** — off current `origin/main`:
   ```bash
   git fetch origin && git checkout -b chore/{name}-v{version} origin/main
   ```

3. **Format**: `npm run format --workspace=packages/{name}`

4. **Checks** — must pass; fix and re-run until clean, never skip:
   ```bash
   # cms-utils
   npm run prepush --workspace=packages/cms-utils
   # cms-react
   npm run build --workspace=packages/cms-utils && npm run prepush --workspace=packages/cms-react
   # admin (no prepush; lint not gated in CI)
   npm run build --workspace=packages/cms-utils
   npm run format:check --workspace=packages/admin
   npm test --workspace=packages/admin
   npm run build:lib --workspace=packages/admin
   ```

5. **Consumers** — bump caret ranges per the Package Map, skip `"*"`, then `npm install` at the repo root.

6. **Commit & push**:
   ```bash
   git add -A && git commit -m "{name} v{version}"
   git push -u origin chore/{name}-v{version}
   ```

7. **PR**: `gh pr create --base main --title "{name} v{version}"`

8. **Wait for CI** — `gh pr checks {pr} --watch`. All must pass. If any fail, fix, push, wait again.

9. **Merge**: `gh pr merge {pr} --squash --delete-branch`

10. **Verify** — merging triggers `auto-publish.yml`, which reruns every suite then publishes any package whose version isn't on npm yet. Watch it, then report the version and `https://github.com/DeepselSystems/deepsel/actions`:
    ```bash
    gh run watch $(gh run list --workflow=auto-publish.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
    npm view @deepsel/{name} version
    ```

## Important

- **Never create or push tags.** Merging to `main` publishes. (`publish-packages.yml` still accepts `{name}-v{version}` tags as a manual re-publish fallback — don't use it for a normal release.)
- **Never merge before CI is green**, and never use `--no-verify`.
- Publishing uses npm Trusted Publishing (OIDC) from `main`; there is no npm token.
- `auto-publish.yml` runs the full suite including e2e, so it is slower than the PR checks.
