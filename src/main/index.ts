import { app, BrowserWindow, net, powerMonitor, safeStorage, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from '@dotenvx/dotenvx';
import log from 'electron-log';
import os from 'node:os';
import type { DevBrain } from '@main/core';
import { createSafeStorageCipher } from './runtime/safe-storage-cipher';
import { migrationsPath } from './runtime/migrations';
import { openElectronSettingsStore } from './runtime/settings-store';
import { startDevBrain } from './runtime/start';
import { closeBeforeQuit, closeCore, forwardSyncTriggers } from './runtime/lifecycle';
import { attachRouter } from './ipc/server';
import { appRouter } from './ipc/router';
import { createContext } from './ipc/context';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// the repository, in development: dist/main is two levels down
const REPO_ROOT = path.join(__dirname, '../..');

loadExpandedEnv();

function loadExpandedEnv() {
  loadEnv({
    path: app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(REPO_ROOT, '.env'),
  });
}

function configureLogging() {
  log.initialize();
  // Never log process.env, credentials or auth headers: the environment holds DEV_LINEAR_API_KEY
  // and GOOGLE_CLIENT_SECRET.
  // handle uncaught errors
  log.errorHandler.startCatching();
  // this path will be gotten from settings like
  // settings.get('data.logPath', process.env.LOG_PATH)
  // TODO: in dev, disable console logging
  log.transports.file.resolvePathFn = () => path.join(os.homedir(), 'devteam', 'logs');
}

// --- DevBrain -------------------------------------------------------------
const devBrainLog = log.scope('devbrain');

// The DevBrain folder: in development the one `npm run seed:dev` fills (DEV_PATH, relative to the
// repository, as the seed script reads it), else DEVBRAIN_PATH or ~/.devbrain.
function devBrainRootPath(): string {
  if (!app.isPackaged) return path.resolve(REPO_ROOT, process.env.DEV_PATH ?? '.dev');
  return process.env.DEVBRAIN_PATH ?? path.join(os.homedir(), '.devbrain');
}

// Must run after `ready`: net.fetch and safeStorage's async API are only usable from then. Null
// when there is no DevBrain folder in development, or starting failed. Never rejects: a failure is
// logged, and the window stays up.
async function startCore(): Promise<DevBrain | null> {
  try {
    return await startDevBrain({
      rootPath: devBrainRootPath(),
      createIfMissing: app.isPackaged,
      settingsStore: openElectronSettingsStore,
      workspace: {
        migrationsPath: migrationsPath({
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          repoRoot: REPO_ROOT,
          override: process.env.DB_MIGRATIONS_PATH,
        }),
        // the key stays in the OS keychain; in development the seed script's dev blobs are read too
        cipher: createSafeStorageCipher(safeStorage, { readDevBlobs: !app.isPackaged }),
        // Chromium's network stack: honours the system proxy (PAC files included) and the OS
        // certificate store, which Node's fetch does not
        fetch: (url, init) => net.fetch(url, init),
        openExternal: (url) => shell.openExternal(url),
        logger: log.scope('sync'),
      },
      logger: devBrainLog,
    });
  } catch (error) {
    devBrainLog.error('Starting DevBrain failed', error);
    return null;
  }
}

// --- IPC ------------------------------------------------------------------
const ipcLog = log.scope('ipc');

// The typed router (src/main/ipc/router.ts); the renderer reaches it through the generic bridge in
// src/preload/index.ts. Attached as soon as core starts, without waiting for it, so the window's
// first calls find their handlers.
function attachIpc() {
  attachRouter(appRouter, {
    createContext,
    // an expected failure is the renderer's to show; only the rest is a bug worth logging
    onError: ({ path, error, shape }) => {
      if (shape.data.code === 'internal')
        ipcLog.error(`IPC call ${path} failed`, error.cause ?? error);
    },
    checkClone: !app.isPackaged,
  });
}

// --- Window ---------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      // sandbox: true is the secure default. It requires the preload to be
      // CommonJS (built to index.cjs). The renderer reaches the main process
      // only through the contextBridge in src/preload/index.ts.
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// --- App lifecycle --------------------------------------------------------
app.whenReady().then(async () => {
  configureLogging();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  const starting = startCore();
  closeBeforeQuit(app, () => closeCore(starting), devBrainLog);
  attachIpc();

  const devBrain = await starting;
  if (devBrain === null) return;
  // window focus and system resume sync the workspace open at the time, if any
  forwardSyncTriggers({ app, powerMonitor }, devBrain, devBrainLog);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
