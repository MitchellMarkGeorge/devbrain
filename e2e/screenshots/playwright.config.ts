import { defineConfig } from '@playwright/test';

// The website's screenshots of the app (website/README.md), taken from the built app over seed:dev's
// data. Not tests: `npm run e2e` never runs them (its config matches *.spec.ts).
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.screens.ts',
  outputDir: '../../test-results/screenshots',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
});
