const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const VITE_CACHE_DIR = path.join(repoRoot, 'client/node_modules/.vite');

// Must run as an npm `pretest` hook (see tests/e2e/package.json), NOT from
// Playwright's globalSetup — Playwright starts its `webServer` (the Astro/Vite
// dev server) concurrently with globalSetup, not after it. Rebuilding
// packages/cms-utils, cms-react, admin and clearing Vite's dep cache while
// that dev server is already live racing to optimize the OLD bundle caused
// alcoris-site's own e2e login page to render blank ~2/3 of the time when this
// same logic lived in global-setup.ts there — a `pretest` hook is a fully
// separate process that npm guarantees completes before `playwright test`
// (and therefore its webServer) ever starts.
//
// Unlike alcoris-site, deepsel doesn't consume @deepsel/* as an external
// dependency — packages/cms-utils, cms-react, admin are workspaces in this
// same repo, already symlinked into node_modules unconditionally (no file:
// override / link-unlink toggle needed). client/ and the e2e-tested backend
// still only see whatever is currently built into each package's dist/,
// though — editing src/ doesn't take effect until a rebuild runs. This flag
// exists to make that rebuild explicit and opt-in rather than something every
// `npm run e2e` pays for.

const wantFresh = process.env.npm_config_local_packages === 'true';

if (!wantFresh) {
  console.log(
    '[e2e pretest] --local-packages not set — using whatever dist/ output already exists.',
  );
  process.exit(0);
}

console.log('[e2e pretest] --local-packages=true — rebuilding @deepsel/* packages from source...');
execSync('npm run build:packages', { cwd: repoRoot, stdio: 'inherit' });
execSync('npm run build:admin', { cwd: repoRoot, stdio: 'inherit' });

console.log('[e2e pretest] reinstalling the backend (editable) to pick up any dependency changes...');
const venvPip = path.join(repoRoot, '.venv/bin/pip');
execSync(`"${venvPip}" install -e ".[dev,auth,oauth,storage,server]"`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

// Vite's optimizeDeps cache is keyed on package.json/lockfile content, not on
// the actual file contents of a workspace-linked package — so rebuilding
// admin's dist/index.js while a previous run's cache is still around leaves
// the client serving a stale pre-bundled @deepsel/admin. Safe to clear here
// since the Astro dev server hasn't started yet (see the timing note above).
console.log(`[e2e pretest] clearing stale Vite dep cache at ${VITE_CACHE_DIR}...`);
fs.rmSync(VITE_CACHE_DIR, { recursive: true, force: true });
