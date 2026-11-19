import fs from 'node:fs';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { BUILT_MAIN, MIGRATIONS_PATH, REPO_ROOT } from './paths';

export interface LaunchOptions {
  // the DevBrain folder the app opens
  folder: string;
  // Electron's user data (its single-instance lock, caches): one per test, so a DevBrain the
  // developer has open never stops a test's app from starting, and tests never share one
  userDataDir: string;
  // the migrations every workspace is opened with: the repository's, or a copy with extra ones
  migrationsPath?: string;
  // more environment for main
  env?: Record<string, string>;
  // more switches for Electron and Chromium (`--force-device-scale-factor=2`)
  args?: string[];
}

/** A running DevBrain: Electron's main process, and its one window. */
export interface RunningApp {
  app: ElectronApplication;
  window: Page;
  // what main printed (its log lines go to stdout), attached to a failed test
  log: string[];
}

/**
 * Starts the built app (`npm run build` first) on `folder`, as `electron .` would, and waits for
 * its window. The app runs unpackaged, so main reads the DevBrain folder from DEV_PATH and the
 * migrations from DB_MIGRATIONS_PATH (src/main/index.ts); both are set here, along with every
 * other variable main reads from the repository's .env, so a developer's .env never reaches the
 * test: a variable set, even empty, is one .env doesn't override.
 */
export async function launchApp(options: LaunchOptions): Promise<RunningApp> {
  if (!fs.existsSync(BUILT_MAIN)) {
    throw new Error(`No built app at ${BUILT_MAIN}: run \`npm run build\` (npm run e2e does)`);
  }
  const app = await electron.launch({
    args: [
      REPO_ROOT,
      `--user-data-dir=${options.userDataDir}`,
      // Linux without a keyring: safeStorage's fixed key, instead of waiting on a secret service
      ...(process.platform === 'linux' ? ['--password-store=basic'] : []),
      ...(options.args ?? []),
    ],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DEV_PATH: options.folder,
      DB_MIGRATIONS_PATH: options.migrationsPath ?? MIGRATIONS_PATH,
      // no dev server (the built renderer), no Linear key from .env
      VITE_DEV_SERVER_URL: '',
      DEV_LINEAR_API_KEY: '',
      // Dates the tests read ("Tomorrow", an all-day event's day) don't move with the machine's zone
      TZ: process.env.E2E_TZ ?? 'UTC',
      ...options.env,
    },
  });
  const log: string[] = [];
  const keep = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      // Chromium's complaints about a missing D-Bus on CI machines
      if (line !== '' && !line.includes('dbus/')) log.push(`${line}\n`);
    }
  };
  app.process().stdout?.on('data', keep);
  app.process().stderr?.on('data', keep);
  const window = await app.firstWindow();
  window.on('pageerror', (error) =>
    log.push(`[renderer] uncaught ${error.stack ?? error.message}\n`),
  );
  window.on('console', (message) => {
    if (message.type() === 'error') log.push(`[renderer] ${message.text()}\n`);
  });
  await window.waitForLoadState('domcontentloaded');
  return { app, window, log };
}

/**
 * Quits as the user does (app.quit): main holds the quit until DevBrain has closed the workspace,
 * which saves its last page in the manifest (src/main/runtime/lifecycle.ts). Resolves once the
 * process has exited.
 */
export async function quitApp({ app }: RunningApp): Promise<void> {
  const exited = new Promise<void>((resolve) => {
    if (app.process().exitCode !== null) resolve();
    else app.process().once('exit', () => resolve());
  });
  await app
    .evaluate(({ app: electronApp }) => electronApp.quit())
    .catch(() => {
      // the process went away while the call was answered
    });
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), QUIT_TIMEOUT_MS);
  });
  const result = await Promise.race([exited, timedOut]);
  clearTimeout(timer);
  if (result === 'timeout') {
    app.process().kill('SIGKILL');
    throw new Error(`The app didn't quit within ${QUIT_TIMEOUT_MS / 1000}s, and was killed`);
  }
}

// A quit waits for the workspace to close (its sync runs, note saves); far longer is a hang
const QUIT_TIMEOUT_MS = 15_000;

/** The workspace id in the window's URL (`…#/app/<id>/…`), or null outside one. */
export function workspaceIdOf(window: Page): string | null {
  const match = /#\/app\/(wsp_[^/?]+)/.exec(window.url());
  return match?.[1] ?? null;
}
