import { createServer, build } from 'vite';
import { ChildProcess, spawn } from 'node:child_process';
import electronPath from 'electron';
import { withoutSeedSwitches } from '../src/main/runtime/dev-switches.ts';

/**
 * Dev orchestration:
 *  1. Start the Vite dev server for the renderer (HMR).
 *  2. Build main + preload in watch mode.
 *  3. Launch Electron pointed at the dev server.
 *  4. On preload change: reload the focused window.
 *  5. On main change: quit Electron, then relaunch it.
 *  6. On Ctrl+C: quit Electron, then stop.
 *
 * Arguments after `--` go to Electron: `npm run dev -- --seed --reset` seeds the DevBrain folder
 * before the app loads it (src/main/runtime/dev-switches.ts). Only the first launch gets the seed
 * switches; a relaunch keeps the rest, `--path` among them.
 */

// How long Electron gets to quit before it is killed: DevBrain closes the open workspace first,
// which waits for its sync runs to stop
const QUIT_TIMEOUT_MS = 5000;

let electronProcess: ChildProcess | null = null;
let shuttingDown = false;
// the switches for the next launch
let electronArgs = process.argv.slice(2);

const server = await createServer({ configFile: 'vite/renderer.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local[0];
server.printUrls();

/**
 * Asks Electron to quit (it takes SIGTERM as a quit), and resolves once it has exited, killing it
 * if it hasn't within QUIT_TIMEOUT_MS. Its exit is then this script's doing, not the user quitting.
 */
function stopElectron(): Promise<void> {
  const child = electronProcess;
  electronProcess = null;
  if (child === null || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`Electron didn't quit within ${QUIT_TIMEOUT_MS / 1000}s; killing it`);
      child.kill('SIGKILL');
    }, QUIT_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

// Launches Electron, once the one running has quit: DevBrain keeps to a single instance, so a new
// one started while the old one still holds the lock would quit at once. Launches run in order.
let launches = Promise.resolve();
function startElectron() {
  launches = launches.then(async () => {
    await stopElectron();
    if (shuttingDown) return;
    const child = spawn(electronPath as unknown as string, ['.', ...electronArgs], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: url },
    });
    electronProcess = child;
    electronArgs = withoutSeedSwitches(electronArgs);
    child.on('exit', (code) => {
      // stopped by this script, for a relaunch or Ctrl+C
      if (electronProcess !== child) return;
      // the user quit the app: tear everything down
      electronProcess = null;
      void shutDown(code ?? 0);
    });
  });
}

// quits Electron, waiting for it, then stops the dev server and this script
async function shutDown(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  await launches;
  await stopElectron();
  await server.close();
  process.exit(code);
}

// Preload watcher: a rebuild just needs the renderer to reload.
await build({
  configFile: 'vite/preload.config.ts',
  build: {
    watch: {},
  },
  plugins: [
    {
      name: 'reload-on-preload-change',
      writeBundle() {
        server.ws.send({ type: 'full-reload' });
      },
    },
  ],
});

// Main watcher: a rebuild requires relaunching Electron. A development build, which has the dev
// seed (vite/main.config.ts).
await build({
  configFile: 'vite/main.config.ts',
  mode: 'development',
  build: {
    watch: {},
  },
  plugins: [
    {
      name: 'restart-electron-on-main-change',
      writeBundle() {
        startElectron();
      },
    },
  ],
});

// Note: the main watcher's writeBundle fires on the initial build too,
// which is what performs the first Electron launch.

// Ctrl+C reaches Electron too, as it is in the terminal's process group; either way this waits
// for it to have quit before stopping
process.on('SIGINT', () => void shutDown(0));
process.on('SIGTERM', () => void shutDown(0));
