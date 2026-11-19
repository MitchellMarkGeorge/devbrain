import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, type TestInfo } from '@playwright/test';
import { launchApp, quitApp, type RunningApp } from './app';
import {
  FolderState,
  makeTempDir,
  scaffoldFolder,
  seedDevFolder,
  type SeedOptions,
} from './folder';

export interface LaunchOverrides {
  migrationsPath?: string;
  env?: Record<string, string>;
}

/**
 * One test's DevBrain: a temporary DevBrain folder, and the app started on it, as many times as
 * the test quits and relaunches it. Prepare the folder before the first launch (`seed`,
 * `useFolder`), or leave it, and `launch` scaffolds an empty one: the Welcome screen.
 *
 * On a failure, the window's screenshot, main's log and a copy of the DevBrain folder are kept with
 * the test's results, beside Playwright's trace of the window (the config's `use.trace`); otherwise
 * the folder is removed.
 */
export class DevBrainHarness {
  // the DevBrain folder (DEV_PATH)
  readonly folder: string;
  // what the folder holds, read back from its files
  readonly state: FolderState;
  private running: RunningApp | null = null;
  private readonly logs: string[][] = [];

  constructor(
    private readonly dir: string,
    private readonly testInfo: TestInfo,
  ) {
    this.folder = path.join(dir, 'DevBrain');
    this.state = new FolderState(this.folder);
  }

  /** The running app; throws when none is. */
  get app(): RunningApp {
    if (this.running === null) throw new Error('The app is not running: call launch() first');
    return this.running;
  }

  /** Makes the folder a DevBrain folder with one workspace from seed:dev's code. */
  async seed(options?: SeedOptions): Promise<void> {
    await seedDevFolder(this.folder, options);
  }

  /** Copies `source` (a DevBrain folder) in as this test's folder. */
  useFolder(source: string): void {
    fs.rmSync(this.folder, { recursive: true, force: true });
    fs.cpSync(source, this.folder, { recursive: true });
  }

  /** Starts the app on the folder, scaffolding an empty one first if there is nothing there. */
  async launch(overrides: LaunchOverrides = {}): Promise<RunningApp> {
    if (this.running !== null) throw new Error('The app is already running');
    if (!fs.existsSync(this.folder)) await scaffoldFolder(this.folder);
    const running = await launchApp({
      folder: this.folder,
      userDataDir: path.join(this.dir, 'user-data'),
      ...overrides,
    });
    this.running = running;
    this.logs.push(running.log);
    return running;
  }

  /** Quits the app as the user does, and waits for it to exit. */
  async quit(): Promise<void> {
    const running = this.app;
    this.running = null;
    await quitApp(running);
  }

  async relaunch(overrides?: LaunchOverrides): Promise<RunningApp> {
    await this.quit();
    return this.launch(overrides);
  }

  /** Called once the test has run. */
  async finish(failed: boolean): Promise<void> {
    const running = this.running;
    if (running !== null) {
      // Playwright's own failure screenshot doesn't cover Electron's window
      if (failed) {
        const shot = await running.window.screenshot().catch(() => null);
        if (shot !== null) {
          await this.testInfo.attach('screenshot', { body: shot, contentType: 'image/png' });
        }
      }
      this.running = null;
      await quitApp(running).catch(() => running.app.process().kill());
    }
    if (failed) {
      for (const [index, log] of this.logs.entries()) {
        await this.testInfo.attach(`main-${index + 1}.log`, {
          body: log.join(''),
          contentType: 'text/plain',
        });
      }
      if (fs.existsSync(this.folder)) {
        fs.cpSync(this.folder, this.testInfo.outputPath('devbrain-folder'), { recursive: true });
      }
    }
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

export const test = base.extend<{ devbrain: DevBrainHarness }>({
  // Playwright reads a fixture's dependencies from its first parameter, which must be a pattern
  // eslint-disable-next-line no-empty-pattern
  devbrain: async ({}, use, testInfo) => {
    const harness = new DevBrainHarness(makeTempDir(), testInfo);
    await use(harness);
    await harness.finish(testInfo.status !== testInfo.expectedStatus);
  },
});

export { expect };
