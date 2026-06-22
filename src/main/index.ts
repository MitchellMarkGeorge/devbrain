import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadEnv } from '@dotenvx/dotenvx';
import log from 'electron-log';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadExpandedEnv();

// --- IPC handlers ---------------------------------------------------------
// Register handlers here; expose them to the renderer in src/preload/index.ts.
ipcMain.handle('ping', () => 'pong');
ipcMain.handle('app:version', () => app.getVersion());
console.log('hello');

function loadExpandedEnv() {
  loadEnv({
    path: app.isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '../../.env'),
  });
}

function configureLogging() {
  log.initialize();
  log.info(process.env);
  // handle uncaught errors
  log.errorHandler.startCatching();
  // this path will be gotten from settings like
  // settings.get('data.logPath', process.env.LOG_PATH)
  // TODO: in dev, disable console logging
  log.transports.file.resolvePathFn = () => path.join(os.homedir(), 'devteam', 'logs');
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
    console.log(process.env.VITE_DEV_SERVER_URL);
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// --- App lifecycle --------------------------------------------------------
app.whenReady().then(() => {
  configureLogging();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
