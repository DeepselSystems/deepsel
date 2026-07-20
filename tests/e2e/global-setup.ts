import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE_URL, BACKEND_PORT, CLIENT_BASE_URL } from './playwright.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Unlike alcoris-site (backend/ subdir consuming deepsel as a dependency),
// this repo's root IS the backend — main.py/settings.py/db.py live there.
const repoRoot = path.resolve(__dirname, '../..');

declare global {
  // eslint-disable-next-line no-var
  var __e2ePostgres: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __e2eBackend: ChildProcess | undefined;
}

async function waitForBackend(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      // GET .../openapi.json is registered directly on the FastAPI `app` in
      // main.py (not behind any installed app's router), so it's a reliable
      // "backend fully started" probe regardless of which apps are in
      // INSTALLED_APPS — unlike alcoris-site, deepsel core ships no
      // dedicated /health route.
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Backend did not become healthy at ${url} within ${timeoutMs}ms: ${lastErr}`);
}

export default async function globalSetup(): Promise<void> {
  console.log('[e2e setup] starting Postgres testcontainer...');
  const pg = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('deepsel_e2e')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
  globalThis.__e2ePostgres = pg;

  const host = pg.getHost();
  const port = pg.getMappedPort(5432);
  const dbName = pg.getDatabase();
  const dbUser = pg.getUsername();
  const dbPassword = pg.getPassword();

  console.log(`[e2e setup] Postgres ready at ${host}:${port}/${dbName}`);

  const env = {
    ...process.env,
    DB_HOST: host,
    DB_PORT: String(port),
    DB_NAME: dbName,
    DB_USER: dbUser,
    DB_PASSWORD: dbPassword,
    APP_SECRET: 'e2e-test-secret',
    SESSION_STORE: 'filesystem',
    SESSION_COOKIE_SECURE: 'false',
    FILESYSTEM: 'local',
    // The site's public-facing URL (the Astro client), not the backend's own
    // address — used e.g. for generating canonical/public links.
    PUBLIC_URL: CLIENT_BASE_URL,
    // Backend won't try to spawn its own Astro client subprocess
    // (deepsel.apps.cms.utils.client_process.ClientProcessManager) — Playwright's
    // own webServer already starts one, pointed at this backend via E2E_BACKEND_URL.
    NO_CLIENT: 'true',
    ENABLE_GRAPHQL: 'false',
    ENABLE_DOCS: 'false',
    LOG_LEVEL: 'WARNING',
  };

  console.log(`[e2e setup] starting backend (uvicorn) on port ${BACKEND_PORT}...`);
  // venv layout differs by OS: POSIX puts executables in bin/, Windows in Scripts/.exe
  const venvUvicorn = path.join(
    repoRoot,
    process.platform === 'win32' ? '.venv/Scripts/uvicorn.exe' : '.venv/bin/uvicorn',
  );
  const backend = spawn(
    venvUvicorn,
    ['main:app', '--host', '0.0.0.0', '--port', String(BACKEND_PORT)],
    {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  globalThis.__e2eBackend = backend;

  // Same npm-config-flag mechanism as alcoris-site: `npm run e2e --show-backend-logs`
  // sets npm_config_show_backend_logs=true, which propagates as a normal env
  // var to this process. Hidden by default — the backend's own request/response
  // logging is rarely what's being debugged and mostly just adds noise.
  const showBackendLogs = process.env.npm_config_show_backend_logs === 'true';
  if (showBackendLogs) {
    backend.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
    backend.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`));
  }
  backend.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[e2e setup] backend exited with code ${code}`);
    }
  });

  // Surface a spawn failure (e.g. missing venv) immediately instead of waiting
  // out the full waitForBackend timeout with a misleading "fetch failed" error.
  const backendSpawnError = new Promise<never>((_, reject) => {
    backend.on('error', (err) => {
      reject(new Error(`Failed to spawn backend at ${venvUvicorn}: ${err.message}`));
    });
  });

  await Promise.race([waitForBackend(`${API_BASE_URL}/openapi.json`), backendSpawnError]);
  console.log('[e2e setup] backend healthy, ready for tests');
}
