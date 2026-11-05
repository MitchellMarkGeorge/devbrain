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
    // @common and @main, from tsconfig.web.json. The renderer imports src/main for types alone
    // (`import type { AppRouter }`); ESLint rejects a value import, which Vite would bundle
    tsconfigPaths: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    // fonts stay files (styles/fonts.css), so only the scripts a page shows are loaded; Vite would
    // otherwise inline the small ones into the stylesheet
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
});
