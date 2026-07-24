import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE_URL, BACKEND_PORT, CLIENT_BASE_URL, CLIENT_PORT } from './playwright.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Unlike alcoris-site (backend/ subdir consuming deepsel as a dependency),
// this repo's root IS the backend — main.py/settings.py/db.py live there.
const repoRoot = path.resolve(__dirname, '../..');

// Same path scripts/persistent-stack.mjs writes to — read here so a fresh
// (non-E2E_REUSE_STACK) run can detect and tear down a stack left running
// from a previous session.
const PERSISTENT_STACK_MARKER_PATH = path.join(__dirname, '.persistent-stack-mode.json');

interface PersistentStackMarker {
  localPackages: boolean;
  backendPid: number;
  clientPid: number;
  pgContainerId?: string;
  startedAt: string;
}

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

/**
 * Whether a backend from a previously-started `persistent-stack.mjs` is
 * already alive on the fixed E2E port — used by the E2E_REUSE_STACK opt-in
 * below. Session-local dev convenience only; unset in normal/CI runs.
 */
async function isBackendAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

async function waitForPortFree(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Port ${port} still in use ${timeoutMs}ms after killing the stale stack`);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM alone isn't reliable here — `npm exec -- astro dev` (the client
 * process persistent-stack.mjs spawns) has been observed to stay up and keep
 * its port bound after SIGTERM, confirmed by manually testing against a real
 * leftover stack. Escalates to SIGKILL if it hasn't exited after a grace
 * period.
 */
async function killPidForcefully(pid: number, gracePeriodMs = 3_000): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return; // Already dead.
  }

  const deadline = Date.now() + gracePeriodMs;
  while (Date.now() < deadline && isPidAlive(pid)) {
    await new Promise((r) => setTimeout(r, 200));
  }

  if (isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already dead.
    }
  }
}

/**
 * The marker's `clientPid` is `npm exec`'s own PID, not the `astro dev`
 * grandchild it spawns underneath — confirmed by manual testing: killing
 * `clientPid` left the real listener process (a different PID) alive and
 * still bound to CLIENT_PORT. Rather than trying to walk the process tree,
 * find whatever PID(s) are actually bound to a port and kill those directly
 * — works regardless of how many process layers are in between.
 */
function findPidsOnPort(port: number): number[] {
  try {
    const cmd =
      process.platform === 'win32'
        ? `netstat -ano | findstr :${port}`
        : `lsof -ti tcp:${port} -sTCP:LISTEN`;
    const out = execSync(cmd, { encoding: 'utf-8' });
    if (process.platform === 'win32') {
      const pids = out
        .trim()
        .split('\n')
        .map((line) => Number(line.trim().split(/\s+/).pop()));
      return [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
    }
    return out
      .trim()
      .split('\n')
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return []; // Nothing listening, or lsof/netstat unavailable.
  }
}

async function killWhateverIsOnPort(port: number): Promise<void> {
  await Promise.all(findPidsOnPort(port).map((pid) => killPidForcefully(pid)));
}

/**
 * Tears down a `persistent-stack.mjs` left running from a previous session
 * (e.g. the terminal was closed without Ctrl-C) before a fresh run starts.
 *
 * This is a defense-in-depth fallback, not the primary defense — the primary
 * cleanup runs in `scripts/kill-stale-stack.mjs` as an npm `pretest` hook,
 * because Playwright's own webServer plugin checks whether CLIENT_PORT is
 * already bound *before* this globalSetup ever runs (confirmed against
 * @playwright/test's task ordering), so a stale stack that's still fully
 * alive can no longer be raced from in here — by the time this runs,
 * Playwright has already failed fast with a `"port ... already used"` error.
 * This copy still matters for the one path the pretest hook doesn't cover:
 * `npx playwright test` invoked directly, bypassing `npm run e2e`'s pretest
 * chain (only relevant when NOT reusing a stack, since the documented
 * E2E_REUSE_STACK flow bypasses pretest on purpose to keep the stack alive).
 *
 * Only acts when both signals agree it's really our own leftover stack: the
 * gitignored marker file exists AND the backend at BACKEND_PORT still
 * answers the health check — avoids killing an unrelated process that
 * happens to occupy the same port.
 */
async function killStaleStack(): Promise<void> {
  if (!fs.existsSync(PERSISTENT_STACK_MARKER_PATH)) return;

  const marker = JSON.parse(
    fs.readFileSync(PERSISTENT_STACK_MARKER_PATH, 'utf-8'),
  ) as PersistentStackMarker;

  if (!(await isBackendAlive(`${API_BASE_URL}/openapi.json`))) {
    // Marker is stale (process crashed without cleaning up) — nothing to kill.
    fs.rmSync(PERSISTENT_STACK_MARKER_PATH, { force: true });
    return;
  }

  console.log(
    `[e2e setup] found a stale persistent-stack.mjs (started ${marker.startedAt}) holding ports ${BACKEND_PORT}/${CLIENT_PORT} — tearing it down before starting fresh.`,
  );
  await Promise.all([killWhateverIsOnPort(BACKEND_PORT), killWhateverIsOnPort(CLIENT_PORT)]);
  if (marker.pgContainerId) {
    try {
      execSync(`docker stop ${marker.pgContainerId}`, { stdio: 'ignore' });
    } catch {
      // Container may already be gone — best effort only.
    }
  }
  fs.rmSync(PERSISTENT_STACK_MARKER_PATH, { force: true });

  await Promise.all([waitForPortFree(BACKEND_PORT), waitForPortFree(CLIENT_PORT)]);
  console.log('[e2e setup] stale stack torn down.');
}

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_REUSE_STACK === 'true') {
    if (await isBackendAlive(`${API_BASE_URL}/openapi.json`)) {
      console.log(
        '[e2e setup] E2E_REUSE_STACK=true — reusing already-running backend, skipping fresh Postgres/backend startup.',
      );
      return;
    }
    console.log(
      '[e2e setup] E2E_REUSE_STACK=true but no backend is reachable yet — starting fresh (run persistent-stack.mjs first to avoid this).',
    );
  }

  await killStaleStack();

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
