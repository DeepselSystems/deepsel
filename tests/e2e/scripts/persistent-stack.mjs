#!/usr/bin/env node
// Session-local dev convenience: starts the same Postgres testcontainer +
// backend + Astro client that global-setup.ts/playwright.config.ts spin up
// fresh on every `npm run test`, but leaves them running so repeated
// `playwright test` invocations (with E2E_REUSE_STACK=true) can reuse them
// instead of paying the full DB/backend/Vite-cold-start cost every time.
// Not part of the normal CI/team flow — global-setup.ts and playwright.config.ts
// only reuse an existing stack when E2E_REUSE_STACK is explicitly set, so this
// script being absent/not running changes nothing for anyone else.
//
// Usage: node tests/e2e/scripts/persistent-stack.mjs [--local-packages]
// Leave running in the background; Ctrl-C (or kill) to tear everything down.

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(__dirname, '..');
// Unlike alcoris-site (backend/ subdir consuming deepsel as a dependency),
// this repo's root IS the backend — main.py/settings.py/db.py live there.
const repoRoot = path.resolve(e2eDir, '../..');

// Must match the constants in playwright.config.ts — duplicated here rather
// than imported because this script runs standalone via plain `node`, outside
// Playwright's own TS transpilation.
const CLIENT_PORT = 15991;
const BACKEND_PORT = 19851;
const CLIENT_BASE_URL = `http://localhost:${CLIENT_PORT}`;
const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;

const MARKER_PATH = path.join(e2eDir, '.persistent-stack-mode.json');
const wantLocalPackages = process.argv.includes('--local-packages');

async function waitForBackend(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      // GET .../openapi.json is registered directly on the FastAPI `app` in
      // main.py, so it's a reliable "backend fully started" probe regardless
      // of which apps are in INSTALLED_APPS — deepsel core ships no
      // dedicated /health route (unlike alcoris-site).
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Backend did not become healthy at ${url} within ${timeoutMs}ms: ${lastErr}`);
}

async function waitForClient(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return; // any response (even a 404/500) means something is listening
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Client did not become reachable at ${url} within ${timeoutMs}ms`);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM alone isn't reliable for the client process (see
 * killWhateverIsOnPort below) — escalates to SIGKILL if it hasn't exited
 * after a grace period.
 */
async function killPidForcefully(pid, gracePeriodMs = 3_000) {
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
 * `client.pid` is `npm exec`'s own PID, not the `astro dev` grandchild it
 * spawns underneath — confirmed by manual testing: killing `client.pid` left
 * the real listener process (a different PID) alive and still bound to
 * CLIENT_PORT, so a plain Ctrl-C here would silently leave a stale stack
 * behind (the exact scenario global-setup.ts's own stale-stack detection has
 * to clean up on the next fresh run). Kill whatever is actually bound to the
 * port instead of trying to walk the process tree.
 */
function findPidsOnPort(port) {
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

async function killWhateverIsOnPort(port) {
  await Promise.all(findPidsOnPort(port).map((pid) => killPidForcefully(pid)));
}

async function main() {
  console.log(
    `[persistent-stack] mode: ${wantLocalPackages ? '--local-packages' : 'existing dist/ output'}`,
  );

  // Same rebuild-from-source logic as the per-run `pretest` hook, just
  // performed once instead of before every single `playwright test` call.
  execSync(`node ${path.join(repoRoot, 'scripts/ensure-local-packages.js')}`, {
    cwd: e2eDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_local_packages: wantLocalPackages ? 'true' : 'false',
    },
  });

  console.log('[persistent-stack] starting Postgres testcontainer...');
  const pg = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('deepsel_e2e')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();
  console.log(
    `[persistent-stack] Postgres ready at ${pg.getHost()}:${pg.getMappedPort(5432)}/${pg.getDatabase()}`,
  );

  const backendEnv = {
    ...process.env,
    DB_HOST: pg.getHost(),
    DB_PORT: String(pg.getMappedPort(5432)),
    DB_NAME: pg.getDatabase(),
    DB_USER: pg.getUsername(),
    DB_PASSWORD: pg.getPassword(),
    // Overridable via env for anyone who wants a stable secret across runs.
    APP_SECRET: process.env.APP_SECRET || 'e2e-test-secret',
    SESSION_STORE: 'filesystem',
    SESSION_COOKIE_SECURE: 'false',
    FILESYSTEM: 'local',
    PUBLIC_URL: CLIENT_BASE_URL,
    // Backend won't try to spawn its own Astro client subprocess — Playwright's
    // own webServer already starts one, pointed at this backend via E2E_BACKEND_URL.
    NO_CLIENT: 'true',
    ENABLE_GRAPHQL: 'false',
    ENABLE_DOCS: 'false',
    LOG_LEVEL: 'WARNING',
  };

  console.log(`[persistent-stack] starting backend on port ${BACKEND_PORT}...`);
  const venvUvicorn = path.join(
    repoRoot,
    process.platform === 'win32' ? '.venv/Scripts/uvicorn.exe' : '.venv/bin/uvicorn',
  );
  const backend = spawn(
    venvUvicorn,
    ['main:app', '--host', '0.0.0.0', '--port', String(BACKEND_PORT)],
    { cwd: repoRoot, env: backendEnv, stdio: 'inherit' },
  );

  await waitForBackend(`${BACKEND_BASE_URL}/api/v1/openapi.json`);
  console.log('[persistent-stack] backend healthy.');

  console.log(`[persistent-stack] starting Astro client on port ${CLIENT_PORT}...`);
  const client = spawn(
    'npm',
    ['exec', '--workspace=client', '--', 'astro', 'dev', '--host', '0.0.0.0', '--port', String(CLIENT_PORT)],
    {
      cwd: repoRoot,
      env: { ...process.env, E2E_BACKEND_URL: BACKEND_BASE_URL, PUBLIC_URL: BACKEND_BASE_URL },
      stdio: 'inherit',
    },
  );

  await waitForClient(CLIENT_BASE_URL);
  console.log('[persistent-stack] client reachable.');

  fs.writeFileSync(
    MARKER_PATH,
    JSON.stringify(
      {
        localPackages: wantLocalPackages,
        backendPid: backend.pid,
        clientPid: client.pid,
        // Lets a later fresh (non-E2E_REUSE_STACK) global-setup.ts run stop
        // this specific container if this stack was left running stale.
        pgContainerId: pg.getId(),
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(
    '[persistent-stack] READY. Run tests with E2E_REUSE_STACK=true to reuse this stack. Ctrl-C to tear down.',
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[persistent-stack] shutting down...');
    await Promise.all([killWhateverIsOnPort(CLIENT_PORT), killWhateverIsOnPort(BACKEND_PORT)]);
    await pg.stop();
    fs.rmSync(MARKER_PATH, { force: true });
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[persistent-stack] failed to start:', err);
  process.exit(1);
});
