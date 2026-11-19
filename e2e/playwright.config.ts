import { defineConfig } from '@playwright/test';

// The end-to-end tests: the built app, driven through Playwright's Electron support
// (docs/testing.md). Run with `npm run e2e`, which builds the app first and, on Linux without a
// display, runs under Xvfb.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '../test-results/e2e',
  // each test starts its own app on its own folder; a few at a time keep a CI machine responsive
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: '../test-results/e2e/results.xml' }]]
    : [['list'], ['html', { outputFolder: '../playwright-report', open: 'never' }]],
  use: {
    // of the app's window, kept for a failed test only (`--trace on` to keep every one); the
    // harness takes a failed test's screenshot (support/fixtures.ts)
    trace: 'retain-on-failure',
  },
});
