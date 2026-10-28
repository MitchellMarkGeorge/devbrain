import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@common', replacement: path.resolve(__dirname, 'src/common') },
      { find: '@main', replacement: path.resolve(__dirname, 'src/main') },
      // in Node the real package exports only the binary's path
      {
        find: /^electron$/,
        replacement: path.resolve(__dirname, 'src/main/tests/__mocks__/electron.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    // core's tests, the main process's own in src/main/tests, and the shared and renderer code's
    include: [
      'src/main/**/*.test.ts',
      'src/common/**/*.test.ts',
      'src/renderer/**/*.test.ts',
      'src/renderer/**/*.test.tsx',
    ],
    // run through vite rather than Node, so a test's vi.mock('node:fs') reaches the fs calls they
    // make (see tests/workspace/registry.test.ts)
    server: { deps: { inline: ['atomically', 'stubborn-fs'] } },
  },
});
