// Single source of truth for the Postgres testcontainer image tag, shared
// between global-setup.ts (which actually starts the container) and
// test-e2e.yml's pre-pull step (which resolves it via a node -e call, same
// pattern already used there for the Playwright browser version) — keeps the
// two from silently drifting apart the way two hardcoded copies eventually
// would.
export const POSTGRES_IMAGE = 'postgres:17-alpine';
