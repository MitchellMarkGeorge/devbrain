import type { DevBrain } from '@main/core';
import type { SyncLogger } from '@main/core/sync/types';

// What the app's lifecycle does to the open workspace: forward window focus and system resume to
// its scheduler, and close it before the app quits. Electron's app and powerMonitor are passed in,
// typed down to the events used, so tests can drive them with plain emitters.

export interface FocusSource {
  // any of the app's windows gained focus
  on(event: 'browser-window-focus', listener: () => void): unknown;
}

export interface ResumeSource {
  // the system woke from sleep
  on(event: 'resume', listener: () => void): unknown;
}

export interface QuittingApp {
  on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): unknown;
  quit(): void;
}

type Logger = Pick<SyncLogger, 'warn'>;

/**
 * Asks the open workspace's scheduler for a focus or resume sync, which it skips for a source that
 * ran under a minute ago or is backing off. Does nothing while no workspace is open, including
 * while one is being switched or closed. Never throws: nothing waits on the trigger.
 */
export function triggerSync(
  devBrain: Pick<DevBrain, 'currentWorkspace'>,
  reason: 'focus' | 'resume',
  logger: Logger,
): void {
  const workspace = devBrain.currentWorkspace;
  if (!workspace) return;
  workspace.sync.trigger(reason).catch((error: unknown) => {
    const name = error instanceof Error ? error.name : typeof error;
    logger.warn(`Sync trigger threw reason=${reason} error=${name}`);
  });
}

// focus and resume trigger a sync of the workspace open at the time, read at each event, so a
// switch is followed
export function forwardSyncTriggers(
  sources: { app: FocusSource; powerMonitor: ResumeSource },
  devBrain: Pick<DevBrain, 'currentWorkspace'>,
  logger: Logger,
): void {
  sources.app.on('browser-window-focus', () => triggerSync(devBrain, 'focus', logger));
  sources.powerMonitor.on('resume', () => triggerSync(devBrain, 'resume', logger));
}

/**
 * Holds the quit until `close` has settled, then quits again, so no sync run writes after the app
 * has shut down. Electron does not wait on a promise returned from a quit listener: the first
 * `before-quit` is prevented, and the `app.quit()` after closing goes through. Quitting again
 * while closing does nothing more. A failed close is logged and the app still quits.
 */
export function closeBeforeQuit(
  app: QuittingApp,
  close: () => Promise<void>,
  logger: Logger,
): void {
  let closing = false;
  let closed = false;
  app.on('before-quit', (event) => {
    if (closed) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    close()
      .catch((error: unknown) => {
        const name = error instanceof Error ? error.name : typeof error;
        logger.warn(`Closing DevBrain before quitting threw error=${name}`);
      })
      .finally(() => {
        closed = true;
        app.quit();
      });
  });
}
