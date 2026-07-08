import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
// Absolute path to the SVG flag directory inside @deepsel/cms-utils. Resolves to
// src/flags/svg whether cms-utils is linked (packages/) or installed (node_modules/).
import { flagsSvgDir } from '@deepsel/cms-utils/flags/server';

const require = createRequire(import.meta.url);

// Serve flag SVGs at /flags/<isoCode>.svg during standalone admin dev. getFlagUrl()
// in cms-utils returns absolute /flags/... URLs, which the consuming apps (e.g. the
// Alcoris site) back with an Astro API route. The standalone admin dev server has no
// such route, so the language-selector flags 404. This dev-only middleware serves them
// straight from the cms-utils package so flags render when developing admin locally.
const CACHE_MAX_AGE_SECONDS = 31536000; // one year — flags are versioned with the package
function flagsDevPlugin() {
  return {
    name: 'deepsel-flags-dev',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use('/flags', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/+/, ''));
        if (!name.endsWith('.svg')) return next();

        const filePath = path.resolve(flagsSvgDir, name);
        if (!filePath.startsWith(flagsSvgDir + path.sep)) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.statusCode = 404;
            return res.end('Not found');
          }
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}, immutable`);
          res.end(content);
        });
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), flagsDevPlugin()],
  base: '/admin/',
  resolve: {
    // Force a single React copy across the monorepo to avoid invalid hook calls
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
