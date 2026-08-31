import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  // A LIBRARY build must never bake a developer's local backend into the
  // published bundle. `packages/admin/.env` carries
  // `VITE_PUBLIC_BACKEND=http://localhost:8000` for the standalone admin dev
  // server, and `vite build` would otherwise constant-fold it into
  // `src/constants/backendHost.js` — shipping a dist whose every request goes
  // to an absolute `http://localhost:8000/api/v1`, which is wrong for every
  // consumer (the hvap-app SPA proxies a relative `/api/v1`, and a k8s deploy
  // has nothing on that port). Pointing `envDir` at a directory with no `.env`
  // keeps the build-time value undefined, so `getInitialBackendHost()` falls
  // back to `DEFAULT_PROD_BACKEND` (`''` -> a relative `/api/v1`). Consumers
  // still set the host at runtime with `configureAdmin({ backendHost })`,
  // `window.PUBLIC_BACKEND`, or their own `VITE_PUBLIC_BACKEND` at THEIR build.
  envDir: path.resolve(import.meta.dirname, 'build-env'),
  resolve: {
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    lib: {
      entry: path.resolve(import.meta.dirname, 'src/index.js'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: (id) => {
        // Externalize all peer dependencies and their subpath imports
        // so we don't bundle their entire source code in the library
        const externalPrefixes = [
          'react',
          'react-dom',
          'react-router-dom',
          '@mantine',
          '@mui',
          '@emotion',
          '@tiptap',
          'tiptap-extension-font-size',
          '@hello-pangea',
          '@fortawesome',
          '@tabler',
          '@capacitor',
          '@deepsel',
          'i18next',
          'react-i18next',
          'zustand',
          'dayjs',
          'lodash',
          'recharts',
          'react-helmet',
          'react-device-detect',
        ];
        return externalPrefixes.some((prefix) => id === prefix || id.startsWith(prefix + '/'));
      },
    },
    outDir: 'dist',
    sourcemap: true,
    cssCodeSplit: false,
  },
});
