import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { CdpConnection, evaluate, type CdpEvent } from './smoke/cdp.mjs';
import { checkPackageFiles } from './smoke/package-files.mjs';
import {
  PAGE_CHECKS,
  WORKSPACE_CHECK,
  type PageCheckResult,
  type WorkspaceCheckResult,
} from './smoke/page-checks.mjs';

/**
 * The startup smoke check: launches the app and passes once its first window has loaded and the
 * checks below pass. It fails on an error the page throws or logs (a script, a resource that did
 * not load, a CSP violation), the app exiting or throwing while it loads, a failed check, or a
 * timeout (DEVBRAIN_SMOKE_TIMEOUT_MS, 90 s).
 *
 * - `npm run smoke` builds the app and launches Electron on the build, in development mode with no
 *   DevBrain folder (DEV_PATH is set to one that does not exist), so it never opens your dev
 *   workspace.
 * - `npm run smoke:packaged` launches the app electron-builder packaged into release/ (or the one
 *   given with `--app`: an AppImage, which is extracted first so no FUSE is needed, a macOS .app,
 *   or the app's executable). It checks the package's files first (scripts/smoke/package-files.mts).
 *   The packaged app makes its DevBrain folder on first run, here in a temporary home
 *   (DEVBRAIN_PATH and HOME), so the check then creates and opens a workspace: better-sqlite3 and
 *   the migrations the package ships.
 *
 * It drives the app over the Chrome DevTools Protocol (--remote-debugging-port), not a hook loaded
 * into main: a packaged Electron app ignores NODE_OPTIONS. Other arguments go to the app:
 * `npm run smoke -- --no-sandbox`. On Linux it needs a display: with no DISPLAY or WAYLAND_DISPLAY
 * it runs under xvfb-run, which must be installed (apt install xvfb).
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TIMEOUT_MS = Number(process.env.DEVBRAIN_SMOKE_TIMEOUT_MS ?? 90_000);
// the page's own errors can arrive just after the checks: wait for them before passing
const SETTLE_MS = 1_000;

// --packaged and --app <path> are this script's; everything else goes to the app
const appArgs: string[] = [];
let appPath: string | undefined;
let packaged = false;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--packaged') packaged = true;
  else if (arg === '--app') appPath = process.argv[++i];
  else if (arg.startsWith('--app=')) appPath = arg.slice('--app='.length);
  else appArgs.push(arg);
}
if (appPath !== undefined) packaged = true;

let finished = false;
// set at the launch; a check before it can fail first
const launch: { child?: ChildProcess; timer?: NodeJS.Timeout } = {};
const passed: string[] = [];
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'devbrain-smoke-'));
const env: NodeJS.ProcessEnv = { ...process.env };
// the DevTools endpoint is printed, which is how the port it chose is found
const args = ['--remote-debugging-port=0', ...appArgs];
let command: string;
let resourcesPath: string | undefined;

if (packaged) {
  const app = path.resolve(appPath ?? defaultPackagedApp());
  ({ command, resourcesPath } = packagedExecutable(app));
  // a first run, kept out of your own DevBrain folder, settings, logs and app data
  const home = path.join(tempDir, 'home');
  mkdirSync(home);
  Object.assign(env, {
    DEVBRAIN_PATH: path.join(tempDir, 'devbrain'),
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
  });
} else {
  command = electronPath as unknown as string;
  args.unshift('.');
  // a folder that does not exist: in development loadCore then opens no DevBrain folder
  env.DEV_PATH = path.join(tempDir, 'none');
}

// Chromium refuses to run as root without --no-sandbox (containers)
if (process.platform === 'linux' && process.getuid?.() === 0 && !args.includes('--no-sandbox'))
  args.push('--no-sandbox');

if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  if (spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).error)
    fail(
      'no display, and xvfb-run is not installed. Install xvfb (apt install xvfb) or run with a display.',
    );
  args.unshift('-a', command);
  command = 'xvfb-run';
}

if (resourcesPath !== undefined) passed.push(...checkPackageFiles(resourcesPath));

console.log(`smoke: launching ${packaged ? 'the packaged app' : 'the build'}: ${command}`);
const launched = spawn(command, args, {
  cwd: REPO_ROOT,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  // its own process group, so the app goes with xvfb-run when it is stopped
  detached: process.platform !== 'win32',
});
launch.child = launched;
launch.timer = setTimeout(
  () => fail(`the checks did not finish within ${TIMEOUT_MS} ms`),
  TIMEOUT_MS,
);

launched.on('error', (error) => fail(`could not start ${command}`, error));
launched.on('exit', (code, signal) => {
  if (!finished) fail(`the app exited before the checks finished (${code ?? signal})`);
});

// what Electron prints for an error loading the main process, or one main doesn't catch
const MAIN_ERROR =
  /App threw an error during load|Uncaught Exception|A JavaScript error occurred in the main process/;
// The app's output, passed on and read for the DevTools endpoint and for errors in main. Both
// streams: Chromium writes the endpoint to stderr, which xvfb-run sends to stdout.
let output = '';
let connecting = false;
const read = (to: NodeJS.WriteStream) => (chunk: Buffer) => {
  to.write(chunk);
  output += chunk.toString();
  const mainError = MAIN_ERROR.exec(output);
  if (mainError) fail(`the main process threw: ${mainError[0]}`);
  const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(output);
  if (endpoint && !connecting) {
    connecting = true;
    run(endpoint[1]).catch((error: unknown) => fail('a check failed', error));
  }
};
launched.stdout.on('data', read(process.stdout));
launched.stderr.on('data', read(process.stderr));

async function run(browserUrl: string) {
  const cdp = await CdpConnection.open(browserUrl);
  const page = await attachToFirstPage(cdp);
  await waitForLoad(cdp, page);

  const result = await evaluate<PageCheckResult>(cdp, page, PAGE_CHECKS);
  if (!result.csp.includes("script-src 'self'"))
    throw new Error(`the page's Content-Security-Policy is missing or changed: "${result.csp}"`);
  if (result.nodeInPage) throw new Error('the page can reach Node (require or process)');
  if (!result.bridge) throw new Error('the preload did not expose the IPC bridge');
  const url = await evaluate<string>(cdp, page, 'location.href');
  passed.push(`the first window loaded ${url}`, 'CSP in place, no Node in the page');

  if (packaged) {
    const workspace = await evaluate<WorkspaceCheckResult>(cdp, page, WORKSPACE_CHECK);
    passed.push(
      `created and opened workspace ${workspace.workspaceId}, wrote a task and drew it`,
      `fonts loaded: ${workspace.fonts.join(', ')}`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  if (finished) return;
  finished = true;
  for (const line of passed) console.log(`smoke: ok: ${line}`);
  console.log('smoke: passed');
  // closes the app as a quit does
  await cdp.send('Browser.close').catch(() => {});
  cdp.close();
  stop(0);
}

// The app's window, attached to before its page runs when it opens after this connects, with its
// errors watched from then on. Resolves with the page's session.
function attachToFirstPage(cdp: CdpConnection): Promise<string> {
  return new Promise((resolve, reject) => {
    let pageSession: string | undefined;
    cdp.on((event: CdpEvent) => {
      if (event.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = event.params as {
          sessionId: string;
          targetInfo: { type: string };
        };
        if (targetInfo.type !== 'page' || pageSession !== undefined) {
          cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
          return;
        }
        pageSession = sessionId;
        Promise.all([
          cdp.send('Runtime.enable', {}, sessionId),
          cdp.send('Log.enable', {}, sessionId),
        ])
          .then(() => cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId))
          .then(() => resolve(sessionId), reject);
        return;
      }
      if (event.sessionId !== undefined && event.sessionId === pageSession) watchForErrors(event);
    });
    cdp
      .send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
      })
      .catch(reject);
  });
}

// an uncaught error in the page, a resource that failed to load, a CSP violation, or anything it
// logs as an error
function watchForErrors(event: CdpEvent) {
  if (event.method === 'Runtime.exceptionThrown') {
    const { exceptionDetails } = event.params as {
      exceptionDetails: { text: string; exception?: { description?: string } };
    };
    fail(`the page threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  } else if (event.method === 'Runtime.consoleAPICalled') {
    const { type, args } = event.params as {
      type: string;
      args: { value?: unknown; description?: string }[];
    };
    if (type === 'error')
      fail(
        `the page logged an error: ${args.map((a) => a.description ?? String(a.value)).join(' ')}`,
      );
  } else if (event.method === 'Log.entryAdded') {
    const { entry } = event.params as { entry: { level: string; text: string; url?: string } };
    if (entry.level === 'error')
      fail(`the page logged an error: ${entry.text}${entry.url ? ` (${entry.url})` : ''}`);
  }
}

async function waitForLoad(cdp: CdpConnection, page: string) {
  while ((await evaluate<string>(cdp, page, 'document.readyState')) !== 'complete')
    await new Promise((resolve) => setTimeout(resolve, 100));
}

function fail(message: string, error?: unknown): never {
  if (!finished) {
    finished = true;
    for (const line of passed) console.log(`smoke: ok: ${line}`);
    console.error(`smoke: FAILED: ${message}`, ...(error === undefined ? [] : [error]));
  }
  return stop(1);
}

function stop(code: number): never {
  clearTimeout(launch.timer);
  const { child } = launch;
  if (child !== undefined && child.exitCode === null && child.pid !== undefined) {
    try {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid, 'SIGKILL');
    } catch {
      // gone already
    }
  }
  rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  process.exit(code);
}

// What electron-builder leaves in release/ for this platform (electron-builder.yml)
function defaultPackagedApp(): string {
  const release = path.join(REPO_ROOT, 'release');
  const names = existsSync(release) ? readdirSync(release).sort() : [];
  let found: string | undefined;
  if (process.platform === 'linux') found = names.find((name) => name.endsWith('.AppImage'));
  else if (process.platform === 'darwin') {
    // release/mac-arm64 or release/mac (x64): this Mac's own architecture first
    const dirs = [`mac-${process.arch}`, 'mac', 'mac-universal'].filter((dir) =>
      names.includes(dir),
    );
    found = dirs[0] && path.join(dirs[0], 'DevBrain.app');
  } else if (process.platform === 'win32') found = path.join('win-unpacked', 'DevBrain.exe');
  const app = found && path.join(release, found);
  if (app === undefined || !existsSync(app))
    fail('no packaged app in release/. Run `npm run compile` first, or pass --app.');
  return app;
}

// The executable to launch and its resources folder: for an AppImage (extracted), a macOS .app, or
// an executable in electron-builder's unpacked folder
function packagedExecutable(app: string): { command: string; resourcesPath: string } {
  if (app.endsWith('.AppImage')) {
    const result = spawnSync(app, ['--appimage-extract'], { cwd: tempDir, stdio: 'ignore' });
    const root = path.join(tempDir, 'squashfs-root');
    if (result.status !== 0 || !existsSync(path.join(root, 'AppRun')))
      fail(`could not extract ${app}`, result.error);
    // AppRun sets up the AppImage's environment and starts its executable, as a user's launch does
    return { command: path.join(root, 'AppRun'), resourcesPath: path.join(root, 'resources') };
  }
  if (app.endsWith('.app')) {
    const info = readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8');
    const executable = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(info)?.[1];
    return {
      command: path.join(app, 'Contents', 'MacOS', executable ?? 'DevBrain'),
      resourcesPath: path.join(app, 'Contents', 'Resources'),
    };
  }
  return { command: app, resourcesPath: path.join(path.dirname(app), 'resources') };
}
