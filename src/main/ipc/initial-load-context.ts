import { ipcMain } from 'electron';
import { IPC_INITIAL_LOAD_CONTEXT_CHANNEL } from '@common/ipc/constants';
import type { InitialLoadContext } from '@common/ipc/types';
import type { Page, WorkspaceInfo } from '@common/types';
import type { DevBrain } from '@main/core';
import type { StartupOpen } from '../runtime/start';
import { serializeError } from './errors';

const NO_WORKSPACES: Page<WorkspaceInfo> = { items: [], nextCursor: null };

/**
 * What the page loading now renders first: the open workspace, the one opening, and why main's
 * startup open failed (taken, so only the first page load shows it).
 */
export function initialLoadContext(
  devBrain: DevBrain | null,
  startupOpen: StartupOpen | null = null,
): InitialLoadContext {
  if (devBrain === null) {
    return {
      devBrainAvailable: false,
      current: null,
      opening: null,
      openFailure: null,
      workspaces: NO_WORKSPACES,
      settings: null,
    };
  }
  const { opening } = devBrain.workspaces.status();
  const failure = startupOpen?.takeFailure() ?? null;
  return {
    devBrainAvailable: true,
    current: devBrain.currentWorkspace?.info ?? null,
    opening: opening === null ? null : devBrain.workspaces.getById(opening),
    openFailure: failure === null ? null : serializeError(failure),
    workspaces: devBrain.workspaces.listAll(),
    settings: devBrain.settings.get('settings'),
  };
}

/**
 * Answers the preload's synchronous initial load context message with `build()`, or null when it
 * throws (an unreadable registry), so the page falls back to fetching. The renderer waits on the
 * answer, so one is always given. Returns the function that stops answering.
 */
export function attachInitialLoadContext(
  build: () => InitialLoadContext,
  onError: (error: unknown) => void,
): () => void {
  const listener = (event: { returnValue: unknown }) => {
    try {
      event.returnValue = build();
    } catch (error) {
      onError(error);
      event.returnValue = null;
    }
  };
  ipcMain.on(IPC_INITIAL_LOAD_CONTEXT_CHANNEL, listener);
  return () => {
    ipcMain.removeListener(IPC_INITIAL_LOAD_CONTEXT_CHANNEL, listener);
  };
}
