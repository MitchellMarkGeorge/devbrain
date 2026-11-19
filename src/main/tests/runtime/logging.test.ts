import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { configureLogging, LOG_MAX_SIZE, resolveLogFilePath } from '@main/runtime/logging';

// Where electron-log writes, with Electron's app faked. app.getPath('logs') is what differs by
// platform; the path is joined with the host's separator, so each case compares with path.join.

const REPO = path.join('/', 'work', 'devbrain');

const LOGS_PATHS = {
  darwin: path.join('/Users/ada/Library/Logs/DevBrain'),
  win32: path.join('C:', 'Users', 'ada', 'AppData', 'Roaming', 'DevBrain', 'logs'),
  linux: path.join('/home/ada/.config/DevBrain/logs'),
};

function fakeLog() {
  return {
    initialize: vi.fn(),
    errorHandler: { startCatching: vi.fn() },
    transports: { file: {} as { resolvePathFn?: () => string; maxSize?: number } },
  };
}

function fakeApp(isPackaged: boolean, logsPath: string) {
  return { isPackaged, getPath: vi.fn((name: string) => (name === 'logs' ? logsPath : '')) };
}

describe('resolveLogFilePath', () => {
  it.each(Object.entries(LOGS_PATHS))(
    'puts a packaged app on %s in its logs folder',
    (_platform, logsPath) => {
      expect(
        resolveLogFilePath({ isPackaged: true, logsPath: () => logsPath, repoRoot: REPO }),
      ).toBe(path.join(logsPath, 'main.log'));
    },
  );

  it.each(Object.entries(LOGS_PATHS))(
    'puts a development build on %s in the repository, apart from a release',
    (_platform, logsPath) => {
      const logsPathFn = vi.fn(() => logsPath);
      const file = resolveLogFilePath({ isPackaged: false, logsPath: logsPathFn, repoRoot: REPO });
      expect(file).toBe(path.join(REPO, '.dev-logs', 'main.log'));
      // not in the DevBrain folder, which would make one where there is none
      expect(file.startsWith(path.join(REPO, '.dev') + path.sep)).toBe(false);
      // Electron would create a logs folder no one writes to
      expect(logsPathFn).not.toHaveBeenCalled();
    },
  );
});

describe('configureLogging', () => {
  it('points the file transport at the logs folder, bounded, and catches uncaught errors', () => {
    const log = fakeLog();
    const app = fakeApp(true, LOGS_PATHS.linux);
    configureLogging(log as never, app, REPO);
    expect(log.initialize).toHaveBeenCalledOnce();
    expect(log.errorHandler.startCatching).toHaveBeenCalledOnce();
    expect(log.transports.file.maxSize).toBe(LOG_MAX_SIZE);
    // read when electron-log first writes, not when configured
    expect(app.getPath).not.toHaveBeenCalled();
    expect(log.transports.file.resolvePathFn?.()).toBe(path.join(LOGS_PATHS.linux, 'main.log'));
    expect(app.getPath).toHaveBeenCalledWith('logs');
  });

  it('writes to the repository in development', () => {
    const log = fakeLog();
    const app = fakeApp(false, LOGS_PATHS.darwin);
    configureLogging(log as never, app, REPO);
    expect(log.transports.file.resolvePathFn?.()).toBe(path.join(REPO, '.dev-logs', 'main.log'));
    expect(app.getPath).not.toHaveBeenCalled();
  });
});
