import { defineConfig } from 'vite';
import { dependenciesToExternalize } from './utils';

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
      external: dependenciesToExternalize(),
    },
    emptyOutDir: true,
    minify: false,
    target: 'node24',
  },
});
