import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@common': path.resolve(__dirname, 'src/common'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
  test: {
    environment: 'node',
    // core's tests, and the main process's own in src/main/tests
    include: ['src/main/**/*.test.ts'],
    // run through vite rather than Node, so a test's vi.mock('node:fs') reaches the fs calls they
    // make (see tests/workspace/registry.test.ts)
    server: { deps: { inline: ['atomically', 'stubborn-fs'] } },
  },
});
