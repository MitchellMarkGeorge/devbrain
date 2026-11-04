import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

// Preload build. CommonJS output (.cjs) — required when sandbox: true, which
// is the secure default (set in src/main/index.ts). Sandboxed preload scripts
// cannot be ESM. Loads synchronously and blocks the page, so there is no
// empty-page race condition.
//
// A sandboxed preload can require only electron and a few Node built-ins, never a package from
// node_modules, so everything else it imports is bundled in.
export default defineConfig({
  build: {
    outDir: 'dist/preload',
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    },
    emptyOutDir: true,
    minify: false,
    target: 'node24',
  },
  resolve: {
    // @common and @main, from tsconfig.node.json
    tsconfigPaths: true,
  },
});
