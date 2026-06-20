import { createServer, build } from 'vite';
import { ChildProcess, spawn } from 'node:child_process';
import electronPath from 'electron';

/**
 * Dev orchestration:
 *  1. Start the Vite dev server for the renderer (HMR).
 *  2. Build main + preload in watch mode.
 *  3. Launch Electron pointed at the dev server.
 *  4. On preload change: reload the focused window.
 *  5. On main change: kill + relaunch Electron.
 */

let electronProccess: ChildProcess | null = null;
let restarting = false;

const server = await createServer({ configFile: 'vite.renderer.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local[0];
server.printUrls();

function startElectron() {
  if (electronProccess) {
    restarting = true;
    electronProccess.removeAllListeners('exit');
    electronProccess.kill();
    electronProccess = null;
  }

  electronProccess = spawn(electronPath as unknown as string, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: url },
  });

  electronProccess?.on('exit', (code) => {
    if (restarting) {
      restarting = false;
      return;
    }
    // User closed the app — tear everything down.
    server.close().finally(() => process.exit(code ?? 0));
  });
}

// Preload watcher: a rebuild just needs the renderer to reload.
await build({
  configFile: 'vite.preload.config.ts',
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

// Main watcher: a rebuild requires relaunching Electron.
await build({
  configFile: 'vite.main.config.ts',
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

process.on('SIGINT', () => {
  electronProccess?.kill();
  server.close().finally(() => process.exit(0));
});
