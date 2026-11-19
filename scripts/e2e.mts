import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs the end-to-end tests (docs/testing.md): builds the app, then runs Playwright with the
 * arguments given, `npm run e2e -- e2e/flows/tasks.spec.ts --trace on`.
 *
 * - `--no-build` skips the build, for running again against the app just built.
 * - `--website-screenshots` takes the website's screenshots of the app instead of running the tests
 *   (e2e/screenshots, website/README.md): `npm run website:screenshots`.
 * - On Linux without a display (CI, a container), Playwright runs under Xvfb (`xvfb-run`), where
 *   Electron's window can open.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const screenshots = args.includes('--website-screenshots');
const playwrightArgs = args.filter(
  (arg) => arg !== '--no-build' && arg !== '--website-screenshots',
);

function run(command: string, commandArgs: string[]): number {
  const result = spawnSync(command, commandArgs, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not run ${command}:`, result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

if (!skipBuild) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const code = run(npm, ['run', 'build']);
  if (code !== 0) process.exit(code);
}

const playwright = createRequire(import.meta.url).resolve('@playwright/test/cli');
const command = [
  process.execPath,
  playwright,
  'test',
  '--config',
  screenshots ? 'e2e/screenshots/playwright.config.ts' : 'e2e/playwright.config.ts',
  ...playwrightArgs,
];

const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY;
// -a picks a free display number, so two runs side by side don't collide. The screenshots' window
// is 2880x1800 at 2x, larger than Xvfb's default screen
const xvfbArgs = screenshots ? ['-a', '-s', '-screen 0 3200x2000x24'] : ['-a'];
process.exit(
  needsXvfb ? run('xvfb-run', [...xvfbArgs, ...command]) : run(command[0], command.slice(1)),
);
