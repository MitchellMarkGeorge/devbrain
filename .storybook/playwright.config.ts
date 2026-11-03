import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 4,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:6006',
    browserName: 'chromium',
    viewport: { width: 1440, height: 960 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    cwd: new URL('..', import.meta.url).pathname,
    command:
      'npm exec -- vite preview --host 127.0.0.1 --port 6006 --strictPort --outDir storybook-static',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
  },
});
