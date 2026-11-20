import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // @common and @main, from tsconfig.node.json and tsconfig.web.json
    tsconfigPaths: true,
    alias: [
      // in Node the real package exports only the binary's path
      {
        find: /^electron$/,
        replacement: path.resolve(__dirname, 'src/main/tests/__mocks__/electron.ts'),
      },
    ],
  },
  test: {
    // run through vite rather than Node, so a test's vi.mock('node:fs') reaches the fs calls they
    // make (see tests/workspace/registry.test.ts)
    server: { deps: { inline: ['atomically', 'stubborn-fs', '@fullcalendar/rrule'] } },
    // each in the environment its code runs in: `npm test -- --project renderer` runs one
    projects: [
      {
        // core's tests, the main process's own in src/main/tests, and the code main and the
        // renderer share: in Node
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/common/**/*.test.ts'],
        },
      },
      {
        // the renderer's: in a DOM (happy-dom, in Node), as it always runs with a window
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/renderer/**/*.test.ts'],
        },
      },
    ],
  },
});
