import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { routerGeneratorConfig } from './router-generator';

// Renderer build (React). Served by Vite dev server in development,
// emitted to dist/renderer for production and loaded via loadFile.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  envDir: '../..',
  // The router plugin generates src/renderer/routeTree.gen.ts from the files in
  // src/renderer/routes (docs/renderer/routing.md), and must run before React's
  plugins: [tanstackRouter(routerGeneratorConfig), react()],
  resolve: {
    // @common and @main, from tsconfig.web.json. The renderer imports src/main for types alone
    // (`import type { AppRouter }`); ESLint rejects a value import, which Vite would bundle
    tsconfigPaths: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    // fonts stay files (styles/fonts.css), so only the scripts a page shows are loaded; Vite would
    // otherwise inline the small ones into the stylesheet. Images stay files too: the page's
    // Content-Security-Policy (index.html) allows images from 'self' only, not data: URLs
    assetsInlineLimit: (file) =>
      /\.(woff2?|svg|png|jpe?g|webp|gif)$/.test(file) ? false : undefined,
  },
});
