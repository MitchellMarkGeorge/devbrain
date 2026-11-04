// Loaded into Electron's main process before the app's own entry (NODE_OPTIONS=--import, set by
// scripts/smoke.mts), so it also sees an error loading dist/main/index.js, which the app could not
// catch itself. Quits with 0 once the first window has finished loading, and with 1 on an uncaught
// error, a failed load or a timeout. The page's own errors can arrive just after the load has
// finished, so it waits SETTLE_MS for them before passing.
import { app } from 'electron';

const TIMEOUT_MS = Number(process.env.DEVBRAIN_SMOKE_TIMEOUT_MS ?? 60_000);
const SETTLE_MS = 1_000;

let done = false;
function finish(code, message, error) {
  if (done) return;
  done = true;
  if (code === 0) console.log(`smoke: ${message}`);
  else console.error(`smoke: FAILED: ${message}`, ...(error === undefined ? [] : [error]));
  // app.exit skips before-quit and closing the window: there is nothing to save
  if (app.isReady()) app.exit(code);
  else process.exit(code);
}

process.on('uncaughtException', (error) => finish(1, 'uncaught exception in main', error));
process.on('unhandledRejection', (error) => finish(1, 'unhandled rejection in main', error));

const timer = setTimeout(
  () => finish(1, `no window finished loading within ${TIMEOUT_MS} ms`),
  TIMEOUT_MS,
);

app.on('web-contents-created', (_event, contents) => {
  contents.on('preload-error', (_e, preloadPath, error) =>
    finish(1, `the preload ${preloadPath} failed`, error),
  );
  contents.on('did-fail-load', (_e, code, description, url) =>
    finish(1, `loading ${url} failed: ${description} (${code})`),
  );
  contents.on('render-process-gone', (_e, details) =>
    finish(1, `the renderer process is gone: ${details.reason}`),
  );
  // an uncaught error in the page, or anything it logs as an error
  contents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
    if (level === 'error')
      finish(1, `the page logged an error: ${message} (${sourceId}:${lineNumber})`);
  });
  contents.once('did-finish-load', () => {
    clearTimeout(timer);
    const url = contents.getURL();
    setTimeout(() => finish(0, `the first window finished loading ${url}`), SETTLE_MS);
  });
});
