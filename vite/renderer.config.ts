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
    // only @common: the renderer imports src/main for types alone (tsconfig.web.json maps @main to
    // its declarations), so an @main value import fails the build instead of bundling main code
    alias: { '@common': fileURLToPath(new URL('../src/common', import.meta.url)) },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
