import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

const renderer = (file: string) =>
  fileURLToPath(new URL(`../src/renderer/${file}`, import.meta.url));

// Renderer build (React). Served by Vite dev server in development,
// emitted to dist/renderer for production and loaded via loadFile.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  envDir: '../..',
  plugins: [
    // file routes (src/renderer/routes) into routeTree.gen.ts, which is checked in; before React's
    // plugin. No code splitting: the bundle loads from disk, so splitting only adds work
    tanstackRouter({
      target: 'react',
      routesDirectory: renderer('routes'),
      generatedRouteTree: renderer('routeTree.gen.ts'),
      autoCodeSplitting: false,
    }),
    react(),
  ],
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
