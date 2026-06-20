import { defineConfig } from 'vite';

// Main process build. Targets Node/Electron's main runtime.
// `electron` and Node built-ins are externalized so they resolve at runtime.
export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['electron', 'dotenv', /^node:/],
    },
    emptyOutDir: true,
    minify: false,
    target: 'node24',
  },
});
