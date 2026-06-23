import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
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
