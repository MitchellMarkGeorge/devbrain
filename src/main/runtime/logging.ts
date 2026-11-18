import path from 'node:path';
import type { App } from 'electron';
import type { MainLogger } from 'electron-log';

// electron-log's default file name, kept so the file is where its docs say
export const LOG_FILE_NAME = 'main.log';
// the size at which electron-log moves the file to main.old.log and starts a new one, replacing
// the previous .old: at most twice this on disk
export const LOG_MAX_SIZE = 5 * 1024 * 1024;

export interface LogFilePathOptions {
  // app.isPackaged
  isPackaged: boolean;
  // Electron's logs folder, app.getPath('logs'): ~/Library/Logs/DevBrain on macOS,
  // %APPDATA%\DevBrain\logs on Windows, ~/.config/DevBrain/logs on Linux. Asked for only in a
  // packaged app, as Electron creates the folder when asked.
  logsPath: () => string;
  // the repository, in development
  repoRoot: string;
}

/**
 * The file the main process and every window log to. A packaged app writes to Electron's logs
 * folder; a development build to `.dev-logs` in the repository, beside its `.dev` DevBrain folder,
 * so a developer's runs never mix with an installed release's (on macOS both would otherwise be
 * ~/Library/Logs/DevBrain, its file system ignoring case). Not inside `.dev` itself: a missing
 * DevBrain folder means "run `npm run seed:dev`" in development, and the log would create one.
 */
export function resolveLogFilePath({ isPackaged, logsPath, repoRoot }: LogFilePathOptions): string {
  if (isPackaged) return path.join(logsPath(), LOG_FILE_NAME);
  return path.join(repoRoot, '.dev-logs', LOG_FILE_NAME);
}

/**
 * Sets up electron-log for the main process: the file it writes (read when it first writes, so
 * after this), bounded in size, and uncaught errors caught. A window's `electron-log/renderer`
 * sends its lines here over IPC (`log.initialize()`), so they land in the same file.
 *
 * Never log process.env, credentials or auth headers: in development the environment holds
 * DEV_LINEAR_API_KEY and GOOGLE_CLIENT_SECRET from .env.
 *
 * The console transport stays on: in development it is the terminal running `npm run dev`, and a
 * packaged app's stdout is seen by no one unless it was started from a terminal to debug it.
 */
export function configureLogging(
  log: Pick<MainLogger, 'initialize' | 'errorHandler' | 'transports'>,
  app: Pick<App, 'isPackaged' | 'getPath'>,
  repoRoot: string,
): void {
  log.initialize();
  log.transports.file.resolvePathFn = () =>
    resolveLogFilePath({
      isPackaged: app.isPackaged,
      logsPath: () => app.getPath('logs'),
      repoRoot,
    });
  log.transports.file.maxSize = LOG_MAX_SIZE;
  log.errorHandler.startCatching();
}
