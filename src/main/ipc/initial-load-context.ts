import { ipcMain } from 'electron';
import { IPC_INITIAL_LOAD_CONTEXT_CHANNEL } from '@common/ipc/constants';
import type { InitialLoadContext } from '@common/ipc/types';
import type { Page, WorkspaceInfo } from '@common/types';
import type { DevBrain } from '@main/core';

const NO_WORKSPACES: Page<WorkspaceInfo> = { items: [], nextCursor: null };

export function initialLoadContext(devBrain: DevBrain | null): InitialLoadContext {
  if (devBrain === null) {
    return {
      devBrainAvailable: false,
      current: null,
      workspaces: NO_WORKSPACES,
      settings: null,
    };
  }
  return {
    devBrainAvailable: true,
    current: devBrain.currentWorkspace?.info ?? null,
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
