import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Non-default ports so E2E can coexist with a running dev stack on 4322/8000
// (and with alcoris-site's own E2E suite, which uses 15987/19847).
export const CLIENT_PORT = 15991;
export const BACKEND_PORT = 19851;

export const CLIENT_BASE_URL = `http://localhost:${CLIENT_PORT}`;
export const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;
export const API_BASE_URL = `${BACKEND_BASE_URL}/api/v1`;

// Seeded by deepsel/apps/core/data/user.csv.
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = '1234';

const STORAGE_STATE = path.join(__dirname, '.auth/admin.json');
export { STORAGE_STATE };

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: CLIENT_BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Set via PWSLOWMO env var (see "test:headed" script) — delays each
    // Playwright action by this many ms so a human can follow along in
    // headed mode. Left unset for normal/headless runs.
    launchOptions: process.env.PWSLOWMO ? { slowMo: Number(process.env.PWSLOWMO) } : {},
  },

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'unauth',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'auth',
      testIgnore: [/login\.spec\.ts/, /auth\.setup\.ts/],
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
  ],

  webServer: {
    command: `npm exec --workspace=client -- astro dev --host 0.0.0.0 --port ${CLIENT_PORT}`,
    cwd: repoRoot,
    env: {
      // Read by client/src/utils/getBackendHost.ts — used by both
      // middleware.ts's /api/v1 proxy and astro.config.mjs's Vite dev-server
      // proxy, pointing this run at an isolated backend instead of the
      // shared local dev backend on :8000.
      E2E_BACKEND_URL: BACKEND_BASE_URL,
      // @deepsel/cms-utils' getDefaultBackendHost() falls back to this env var
      // for server-side (SSR) fetches that don't go through the proxy at all
      // (e.g. fetchPublicSettings in admin/[...path].astro). Without it, SSR
      // silently falls back to a hardcoded http://localhost:8000 — leaking
      // requests to whatever real dev backend happens to be running there.
      PUBLIC_URL: BACKEND_BASE_URL,
    },
    port: CLIENT_PORT,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
