import { defineConfig } from 'vite';

// Preload build. CommonJS output (.cjs) — required when sandbox: true, which
// is the secure default (set in src/main/index.ts). Sandboxed preload scripts
// cannot be ESM. Loads synchronously and blocks the page, so there is no
// empty-page race condition.
export default defineConfig({
  build: {
    outDir: 'dist/preload',
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: ['electron', /^node:/],
    },
    emptyOutDir: true,
    minify: false,
    target: 'node24',
  },
});
