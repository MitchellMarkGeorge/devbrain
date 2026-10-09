import { defineConfig, loadEnv } from 'vite';
import { dependenciesToExternalize } from './utils';
import { OAUTH_CLIENT_ENV_KEYS } from '../src/main/core/integrations/providers/oauth-env';

// Main process build. Targets Node/Electron's main runtime.
// `electron` and Node built-ins are externalized so they resolve at runtime.
export default defineConfig(({ mode }) => {
  // OAuth client ids are read at build time, from .env or the build environment, and inlined
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const define = Object.fromEntries(
    OAUTH_CLIENT_ENV_KEYS.map((key) => [`process.env.${key}`, JSON.stringify(env[key] ?? '')]),
  );

  return {
    define,
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
    resolve: {
      tsconfigPaths: true,
    },
  };
});
