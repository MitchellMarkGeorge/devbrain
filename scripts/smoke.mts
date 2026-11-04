import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import electronPath from 'electron';

/**
 * Launches Electron on the built app (`npm run smoke` builds it first) and fails unless the first
 * window finishes loading: scripts/smoke/hook.mjs, loaded into the main process, quits with 0 then,
 * and with 1 on an uncaught error, a failed load or a timeout (DEVBRAIN_SMOKE_TIMEOUT_MS, 60 s).
 *
 * It runs with no DevBrain folder (DEV_PATH is set to an empty temporary one), so it never opens
 * your dev workspace. Arguments are passed to Electron: `npm run smoke -- --no-sandbox`.
 *
 * On Linux it needs a display: with no DISPLAY or WAYLAND_DISPLAY it runs under xvfb-run, which
 * must be installed (apt install xvfb).
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const hook = pathToFileURL(fileURLToPath(new URL('smoke/hook.mjs', import.meta.url))).href;

const devPath = mkdtempSync(path.join(os.tmpdir(), 'devbrain-smoke-'));
// a folder that does not exist: in development loadCore then opens no DevBrain folder
const env = {
  ...process.env,
  DEV_PATH: path.join(devPath, 'none'),
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import="${hook}"`].filter(Boolean).join(' '),
};

const electronArgs = ['.', ...process.argv.slice(2)];
// Chromium refuses to run as root without --no-sandbox (containers)
if (
  process.platform === 'linux' &&
  process.getuid?.() === 0 &&
  !electronArgs.includes('--no-sandbox')
)
  electronArgs.push('--no-sandbox');

let command = electronPath as unknown as string;
let args = electronArgs;
if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  if (spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error) {
    console.error(
      'smoke: FAILED: no display, and xvfb-run is not installed. Install xvfb (apt install xvfb) or run with a display.',
    );
    process.exit(1);
  }
  args = ['-a', command, ...electronArgs];
  command = 'xvfb-run';
}

const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: 'inherit' });
child.on('error', (error) => {
  console.error(`smoke: FAILED: could not start ${command}`, error);
  cleanUp(1);
});
child.on('exit', (code, signal) => cleanUp(code ?? (signal ? 1 : 0)));

function cleanUp(code: number) {
  rmSync(devPath, { recursive: true, force: true });
  if (code === 0) process.exit(0);
  console.error(`smoke: Electron exited with ${code}`);
  process.exit(1);
}
