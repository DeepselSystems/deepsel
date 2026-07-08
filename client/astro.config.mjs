// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
// Only cms-utils and cms-react expose a "source" export condition. Activating it for
// other linked packages (e.g. admin) makes Vite try to resolve src/ entries that the
// npm-published cms-utils/cms-react don't ship.
const SOURCE_CAPABLE = new Set(['@deepsel/cms-utils', '@deepsel/cms-react']);
const hasLinkedSourcePkg = Object.entries(rootPkg.overrides || {}).some(
  ([name, value]) =>
    SOURCE_CAPABLE.has(name) && typeof value === 'string' && value.startsWith('file:'),
);
// When @deepsel/admin is linked, skip Vite dep pre-bundling so it re-reads
// dist/ on every rebuild (link:admin:watch symlinks the package into node_modules).
const adminLinked =
  typeof rootPkg.overrides?.['@deepsel/admin'] === 'string' &&
  rootPkg.overrides['@deepsel/admin'].startsWith('file:');

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [react()],
  vite: {
    resolve: {
      // When a @deepsel/* package is linked via file: override, resolve its
      // "source" export condition so Vite uses src/ directly for HMR.
      // In unlinked (npm) mode this stays off so resolution falls through to dist/.
      conditions: hasLinkedSourcePkg ? ['source'] : [],
      dedupe: ['react', 'react-dom', '@mantine/core', '@mantine/hooks'],
    },
    optimizeDeps: {
      exclude: adminLinked ? ['@deepsel/admin'] : [],
    },
    server: {
      allowedHosts: ['.local'],
      fs: {
        // Allow serving files from the admin directory
        allow: ['../..'],
      },
      proxy: {
        '/api/v1': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },
});
