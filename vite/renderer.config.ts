import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer build (React). Served by Vite dev server in development,
// emitted to dist/renderer for production and loaded via loadFile.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  envDir: '../..',
  plugins: [react()],
  resolve: {
    // only @common: the renderer imports src/main for types alone (`import type { AppRouter }`);
    // ESLint rejects a value import, which Vite would otherwise bundle
    alias: { '@common': fileURLToPath(new URL('../src/common', import.meta.url)) },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
