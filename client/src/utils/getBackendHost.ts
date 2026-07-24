/**
 * The backend origin used for server-side requests (SSR data-fetching,
 * the /api/v1 proxy in middleware.ts, and the Vite dev-server proxy in
 * astro.config.mjs).
 *
 * E2E_BACKEND_URL is set only by tests/e2e/playwright.config.ts's webServer,
 * so it points this run at an isolated backend instance instead of the
 * shared local dev backend on :8000. Every caller must resolve this the same
 * way — a mismatch between callers causes non-deterministic request routing
 * (see the comment in astro.config.mjs's proxy config).
 */
export function getBackendHost(): string {
  return process.env.E2E_BACKEND_URL || 'http://localhost:8000';
}
