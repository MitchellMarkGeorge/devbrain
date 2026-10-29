import { app, BrowserWindow, net, powerMonitor, safeStorage, shell } from 'electron';
import { IPC_EVENT_PREFIX } from '@common/ipc/constants';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from '@dotenvx/dotenvx';
import log from 'electron-log';
import os from 'node:os';
import type { DevBrain } from '@main/core';
import { createSafeStorageCipher } from './runtime/safe-storage-cipher';
import { migrationsPath } from './runtime/migrations';
import { openElectronSettingsStore } from './runtime/settings-store';
import { loadDevBrain } from './runtime/start';
import { closeBeforeQuit, forwardSyncTriggers } from './runtime/lifecycle';
import { attachRouter } from './ipc/server';
import { ChangeTracker } from './ipc/changes';
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

// Opens the DevBrain folder, and no workspace yet: the renderer opens one (workspaces.openLast).
// Must run after `ready`: net.fetch and safeStorage's async API are only usable from then. Null
// when there is no DevBrain folder in development, or the folder is invalid. Never rejects: a
// failure is logged, and the window stays up.
async function loadCore(): Promise<DevBrain | null> {
  try {
    return await loadDevBrain({
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
    devBrainLog.error('Loading DevBrain failed', error);
    return null;
  }
}

// --- IPC ------------------------------------------------------------------
const ipcLog = log.scope('ipc');

// What core changes, as the entities the renderer refetches for: in each mutation's response,
// and pushed to every window for the rest (src/main/ipc/changes.ts)
const changeTracker = new ChangeTracker((name, payload, skipWindow) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents === skipWindow) continue;
    win.webContents.send(`${IPC_EVENT_PREFIX}${name}`, payload);
  }
});

// The typed router (src/main/ipc/router.ts); the renderer reaches it through the generic bridge in
// src/preload/index.ts. Attached before the window is created, so its first calls find it.
function attachIpc(devBrain: DevBrain | null) {
  attachRouter(appRouter, {
    createContext: (call) => createContext({ ...call, devBrain, log: ipcLog }),
    changeTracker,
    // Every failure, once, with the code the renderer gets. An expected one (not_found,
    // invalid_input, …) is the renderer's to show; anything internal is a bug, logged with the
    // original error
    onError: ({ path, error, shape }) => {
      const { code } = shape.data;
      if (code === 'internal') ipcLog.error(`IPC call ${path} failed`, error.cause ?? error);
      else ipcLog.warn(`IPC call ${path} failed error=${code}`);
    },
  });
}

// --- Window ---------------------------------------------------------------
// The app's one window. On macOS, closing it hides it instead, as the app keeps running with no
// window: clicking the Dock icon shows it again as it was, with nothing to reload or refetch.
let mainWindow: BrowserWindow | null = null;
// set once the app starts quitting, when a close really closes
let quitting = false;

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
  win.on('close', (event) => {
    if (process.platform !== 'darwin' || quitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  mainWindow = win;
  hardenWindow(win);

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// The window shows the app's page and nothing else (docs/security/untrusted-content.md): a link
// that escapes the renderer's rules can't open a window or load another page inside DevBrain.
// Links open in the browser through workspace.openUrl only. The app routes within its page, which
// is no navigation; reloading it (as Vite does in development) is the one allowed.
function hardenWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => {
    if (event.url !== win.webContents.getURL()) event.preventDefault();
  });
}

// --- App lifecycle --------------------------------------------------------
// Startup, in order: load DevBrain; attach everything that follows it, before anything starts;
// then create the window, whose first calls find the router. The renderer reopens the last
// workspace itself (workspaces.openLast), so a slow open never holds the window back.
app.whenReady().then(async () => {
  configureLogging();

  const devBrain = await loadCore();
  attachIpc(devBrain);
  if (devBrain !== null) {
    // before the last workspace opens, so the tracker follows it from the start
    changeTracker.watch(devBrain);
    // Holds the quit until DevBrain has closed. A close waits for a workspace still opening, as
    // WorkspaceService queues its transitions
    closeBeforeQuit(app, () => devBrain.close(), devBrainLog);
    // window focus and system resume sync the workspace open at the time, if any
    forwardSyncTriggers({ app, powerMonitor }, devBrain, devBrainLog);
  }

  createWindow();
  // the Dock icon on macOS: shows the hidden window, or makes one if it is gone
  app.on('activate', () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.show();
    else createWindow();
  });
});

// The first before-quit is held while DevBrain closes (closeBeforeQuit), and the window stays up
// meanwhile; the window closes for real on the quit that follows.
app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
