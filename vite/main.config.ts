import { builtinModules } from 'node:module';
import { defineConfig, loadEnv } from 'vite';
import { OAUTH_CLIENT_ENV_KEYS } from '../src/main/core/integrations/providers/oauth-env';

// What the main build leaves for Node to load from node_modules at runtime. Everything else is
// bundled into dist/main/index.js, whatever package.json lists it under.
const EXTERNAL = [
  // provided by Electron
  'electron',
  // Node built-ins, with and without the node: prefix
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  // native module
  'better-sqlite3',
  // finds its preload script from its own folder (path.resolve(__dirname, ...))
  'electron-log',
];

// Main process build: a Node (SSR) build, so packages resolve to their Node builds (turndown's,
// electron-log's main logger) rather than their browser ones, and require() in bundled CommonJS
// works in the ES module output.
export default defineConfig(({ mode }) => {
  // OAuth client ids are read at build time, from .env or the build environment, and inlined
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const define = Object.fromEntries(
    OAUTH_CLIENT_ENV_KEYS.map((key) => [`process.env.${key}`, JSON.stringify(env[key] ?? '')]),
  );

  return {
    define,
    build: {
      ssr: 'src/main/index.ts',
      outDir: 'dist/main',
      rollupOptions: {
        output: { format: 'es', entryFileNames: 'index.js' },
      },
      emptyOutDir: true,
      minify: false,
      target: 'node24',
    },
    ssr: {
      target: 'node',
      noExternal: true,
      external: EXTERNAL,
    },
    resolve: {
      tsconfigPaths: true,
    },
  };
});
