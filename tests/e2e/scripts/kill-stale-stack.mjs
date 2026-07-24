#!/usr/bin/env node
// Must run as an npm `pretest` hook (see ../package.json), NOT from Playwright's
// globalSetup — Playwright's own webServer plugin checks whether CLIENT_PORT is
// already bound (and fails fast with a `"port ... already used"` error unless
// reuseExistingServer is set) BEFORE globalSetup ever runs (confirmed against
// @playwright/test's own task ordering: plugin-setup tasks, which include the
// webServer plugin, are scheduled ahead of globalSetup tasks). So a stale
// persistent-stack.mjs that's still fully alive can never be torn down from
// inside global-setup.ts in time — by the time it runs, Playwright has already
// bailed. This hook runs earlier, before `playwright test` (and its webServer)
// starts at all, so it can actually free the port in time.
//
// global-setup.ts keeps its own copy of this same cleanup (backend port +
// Postgres container + marker file) as a defense-in-depth fallback for the one
// path this hook doesn't cover: `npx playwright test` invoked directly,
// bypassing `npm run e2e`'s pretest chain entirely (the documented flow for
// E2E_REUSE_STACK=true) — in that path there's no race to worry about since
// the intent there is explicitly to keep reusing the stack, not kill it.

import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(__dirname, '..');

// Must match the constants in playwright.config.ts — duplicated here rather
// than imported because this script runs standalone via plain `node`, outside
// Playwright's own TS transpilation (same reasoning as persistent-stack.mjs).
const CLIENT_PORT = 15991;
const BACKEND_PORT = 19851;
const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}`;

const MARKER_PATH = path.join(e2eDir, '.persistent-stack-mode.json');

async function isBackendAlive(url) {
  try {
    // GET .../openapi.json is registered directly on the FastAPI `app` in
    // main.py, so it's a reliable "backend fully started" probe — deepsel
    // core ships no dedicated /health route (unlike alcoris-site).
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    import('node:net').then(({ default: net }) => {
      const tester = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => tester.close(() => resolve(true)))
        .listen(port, '0.0.0.0');
    });
  });
}

async function waitForPortFree(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree(port)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Port ${port} still in use ${timeoutMs}ms after killing the stale stack`);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// SIGTERM alone isn't reliable for the client process — `npm exec -- astro dev`
// has been observed to stay up and keep its port bound after SIGTERM.
// Escalates to SIGKILL if it hasn't exited after a grace period.
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

// The marker's `clientPid` is `npm exec`'s own PID, not the `astro dev`
// grandchild it spawns underneath — kill whatever's actually bound to the
// port instead of trying to walk the process tree.
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
  // Reusing on purpose — leave the stack alone. Same opt-in as
  // global-setup.ts/playwright.config.ts read for this env var.
  if (process.env.E2E_REUSE_STACK === 'true') return;

  if (!fs.existsSync(MARKER_PATH)) return;

  const marker = JSON.parse(fs.readFileSync(MARKER_PATH, 'utf-8'));

  if (!(await isBackendAlive(`${BACKEND_BASE_URL}/api/v1/openapi.json`))) {
    // Marker is stale (process crashed without cleaning up) — nothing to kill.
    fs.rmSync(MARKER_PATH, { force: true });
    return;
  }

  console.log(
    `[e2e pretest] found a stale persistent-stack.mjs (started ${marker.startedAt}) holding ports ${BACKEND_PORT}/${CLIENT_PORT} — tearing it down before starting fresh.`,
  );
  await Promise.all([killWhateverIsOnPort(BACKEND_PORT), killWhateverIsOnPort(CLIENT_PORT)]);
  if (marker.pgContainerId) {
    try {
      execSync(`docker stop ${marker.pgContainerId}`, { stdio: 'ignore' });
    } catch {
      // Container may already be gone — best effort only.
    }
  }
  fs.rmSync(MARKER_PATH, { force: true });

  await Promise.all([waitForPortFree(BACKEND_PORT), waitForPortFree(CLIENT_PORT)]);
  console.log('[e2e pretest] stale stack torn down.');
}

main().catch((err) => {
  console.error('[e2e pretest] failed to tear down stale stack:', err);
  process.exit(1);
});
