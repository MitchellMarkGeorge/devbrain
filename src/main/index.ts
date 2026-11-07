import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  net,
  powerMonitor,
  safeStorage,
  shell,
} from 'electron';
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
import { closeBeforeQuit, forwardSyncTriggers, holdSingleInstance } from './runtime/lifecycle';
import { initialRoute, saveLastPageOnClose, type LastPages } from './runtime/last-page';
import { createElectronDesktop } from './runtime/desktop';
import { createMenuActions, installAppMenu } from './runtime/menu';
import { applyTheme, windowBackground } from './runtime/theme';
import { repaintChrome, windowChrome } from './runtime/window-chrome';
import { followLaunchAtLogin, supportsLoginItem } from './runtime/login-item';
import { attachRouter } from './ipc/server';
import { attachInitialLoadContext, initialLoadContext } from './ipc/initial-load-context';
import { ChangeTracker } from './ipc/changes';
import { appRouter } from './ipc/router';
import { createContext } from './ipc/context';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// the repository, in development: dist/main is two levels down
const REPO_ROOT = path.join(__dirname, '../..');

loadDevelopmentEnv();

// One DevBrain at a time (runtime/lifecycle.ts): a later launch quits at once, and this one shows
// its window instead
const isOnlyInstance = holdSingleInstance(app, () => showMainWindow());

// The repository's .env, in development only. A packaged app ships no .env: the OAuth client values
// are inlined at build time (vite/main.config.ts), DEVBRAIN_PATH has a default, and every other
// variable main reads is for development.
function loadDevelopmentEnv() {
  if (app.isPackaged) return;
  loadEnv({ path: path.join(REPO_ROOT, '.env') });
}

function configureLogging() {
  log.initialize();
  // Never log process.env, credentials or auth headers: in development the environment holds
  // DEV_LINEAR_API_KEY and GOOGLE_CLIENT_SECRET from .env.
  // handle uncaught errors
  log.errorHandler.startCatching();
  // this path will be gotten from settings like
  // settings.get('data.logPath', process.env.LOG_PATH)
  // TODO: in dev, disable console logging
  log.transports.file.resolvePathFn = () => path.join(os.homedir(), 'devteam', 'logs');
}

// where electron-log writes: the menu's Show Log File, and app.showLogFile
const logFilePath = () => log.transports.file.getFile().path;

// --- DevBrain -------------------------------------------------------------
const devBrainLog = log.scope('devbrain');

// The DevBrain folder: in development the one `npm run seed:dev` fills (DEV_PATH, relative to the
// repository, as the seed script reads it), else DEVBRAIN_PATH or ~/.devbrain.
function devBrainRootPath(): string {
  if (!app.isPackaged) return path.resolve(REPO_ROOT, process.env.DEV_PATH ?? '.dev');
  return process.env.DEVBRAIN_PATH ?? path.join(os.homedir(), '.devbrain');
}

// Opens the DevBrain folder, and no workspace yet: the window opens on the last workspace's route,
// and the renderer opens the workspace its route names (runtime/last-page.ts, initialRoute).
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
    // the dialogs are modal to the window the call came from
    createContext: (call) =>
      createContext({
        ...call,
        devBrain,
        desktop: createElectronDesktop(
          { dialog, shell, menu: Menu, logFilePath },
          BrowserWindow.fromWebContents(call.event.sender),
        ),
        log: ipcLog,
      }),
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
  // what each page load renders first, read fresh every time (src/main/ipc/initial-load-context.ts)
  attachInitialLoadContext(
    () => initialLoadContext(devBrain),
    (error) => ipcLog.error('Building the initial load context failed', error),
  );
}

// --- Window ---------------------------------------------------------------
// The app's one window. On macOS, closing it hides it instead, as the app keeps running with no
// window: clicking the Dock icon shows it again as it was, with nothing to reload or refetch.
let mainWindow: BrowserWindow | null = null;
// set once the app starts quitting, when a close really closes
let quitting = false;
// set once startup has made the first window: a launch before that waits for it
let started = false;
// what the window's first route is read from: DevBrain, and the last page seen in each workspace
let devBrainLoaded: DevBrain | null = null;
let lastPages: LastPages | undefined;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // the design system's smallest window (window-min-width, window-min-height): below it the
    // sidebar rail, the task rows and the week grid stop fitting
    minWidth: 960,
    minHeight: 640,
    show: false,
    // the theme's background, so the window never shows white before the page paints
    backgroundColor: windowBackground(nativeTheme),
    // the page draws the title bar on macOS and Windows; Linux keeps the system's
    // (src/main/runtime/window-chrome.ts)
    ...windowChrome(process.platform, nativeTheme),
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

  // The route names the workspace the page opens (docs/renderer/routing.md): the one open last
  // time, on its last page when "Reopen last page" is on, or onboarding. The renderer's hash
  // history reads it from the URL's hash; a reload keeps it.
  const route = initialRoute(devBrainLoaded, lastPages);
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL);
    url.hash = route;
    win.loadURL(url.toString());
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: route });
  }
}

// Brings the window forward: restored if minimised, shown if hidden (macOS hides it on close), or
// made again if it is gone. Before startup has made the first one, there is nothing to do: it is
// about to show.
function showMainWindow() {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    if (started) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// --- Theme ----------------------------------------------------------------
// Follows the theme setting from startup on, before the window is made, so it opens in the
// setting's colours. Without DevBrain there is no setting, and the system's appearance is used.
function followThemeSetting(devBrain: DevBrain | null) {
  applyTheme(nativeTheme, devBrain?.settings.get('settings.theme') ?? 'system');
  devBrain?.settings.onChange(({ settings }) => applyTheme(nativeTheme, settings.theme));
  // a new theme setting, or the system switching appearance while it is 'system': the window's
  // background, and the controls Windows draws over the page, follow it
  nativeTheme.on('updated', () => {
    if (mainWindow !== null) repaintChrome(mainWindow, process.platform, nativeTheme);
  });
}

// --- Launch at login ------------------------------------------------------
// The general.launchOnStartup setting registers DevBrain as an OS login item
// (src/main/runtime/login-item.ts). Not in development, nor on Linux, which Electron doesn't cover.
function followLaunchAtLoginSetting(devBrain: DevBrain | null) {
  if (devBrain === null || !supportsLoginItem(process.platform, app.isPackaged)) return;
  followLaunchAtLogin(app, devBrain.settings, log.scope('login-item'));
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

// --- Menu ---------------------------------------------------------------
// The menu bar (src/main/runtime/menu.ts): its commands run in main, with their dialogs modal to
// the focused window. Set after DevBrain has loaded, so it follows the open workspace.
function attachMenu(devBrain: DevBrain | null) {
  const focusedWindow = () => BrowserWindow.getFocusedWindow() ?? mainWindow;
  installAppMenu({
    setApplicationMenu: (template) => Menu.setApplicationMenu(Menu.buildFromTemplate(template)),
    platform: process.platform,
    appName: app.name,
    isPackaged: app.isPackaged,
    devBrain,
    actions: createMenuActions({
      devBrain,
      window: focusedWindow,
      desktop: (win) => createElectronDesktop({ dialog, shell, menu: Menu, logFilePath }, win),
      dialog,
      showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath),
      logFilePath,
      logger: log.scope('menu'),
    }),
  });
}

// --- App lifecycle --------------------------------------------------------
// Startup, in order: load DevBrain; attach everything that follows it, before anything starts;
// then create the window, whose first calls find the router. The window opens on the last
// workspace's route and the renderer opens it (under its splash), so a slow open never holds the
// window back.
app.whenReady().then(async () => {
  // another instance runs: this one is quitting, and opens nothing
  if (!isOnlyInstance) return;
  configureLogging();

  const devBrain = await loadCore();
  devBrainLoaded = devBrain;
  attachIpc(devBrain);
  if (devBrain !== null) {
    // before the last workspace opens, so the tracker follows it from the start
    changeTracker.watch(devBrain);
    // "Reopen last page": the page the window was on when the workspace closed, quitting included
    lastPages = saveLastPageOnClose(app, devBrain);
    // Holds the quit until DevBrain has closed. A close waits for a workspace still opening, as
    // WorkspaceService queues its transitions
    closeBeforeQuit(app, () => devBrain.close(), devBrainLog);
    // window focus and system resume sync the workspace open at the time, if any
    forwardSyncTriggers({ app, powerMonitor }, devBrain, devBrainLog);
  }

  attachMenu(devBrain);
  followThemeSetting(devBrain);
  followLaunchAtLoginSetting(devBrain);
  createWindow();
  started = true;
  // the Dock icon on macOS: shows the hidden window, or makes one if it is gone
  app.on('activate', showMainWindow);
});

// The first before-quit is held while DevBrain closes (closeBeforeQuit), and the window stays up
// meanwhile; the window closes for real on the quit that follows.
app.on('before-quit', () => {
  quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
