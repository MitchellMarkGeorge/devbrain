import { ipcMain } from 'electron';
import { IPC_INITIAL_LOAD_CONTEXT_CHANNEL } from '@common/ipc/constants';
import type { DevBrain, ThemeSetting, WorkspaceEntry } from '@main/core';
import type { Page } from '@main/core/shared/pagination';
import { lastOpenedWorkspace } from '../runtime/start';

// What a page needs for its first render, so it shows the right screen at once rather than a
// loading state: the renderer can seed its query cache with it. Read again on every page load, so
// a reload sees the workspace open now. Workspace info only (names, colors and ids, never anything
// from a workspace's database), and the theme setting, so the page paints in it from the start.
export interface InitialLoadContext {
  // false when DevBrain could not be loaded: nothing that needs it can run
  devBrainAvailable: boolean;
  // the open workspace: what workspaces.current answers
  current: WorkspaceEntry | null;
  // the workspace workspaces.openLast would open, while none is open, for a splash to show
  last: WorkspaceEntry | null;
  // what workspaces.list answers for its first page
  workspaces: Page<WorkspaceEntry>;
  // the theme setting; 'system' without DevBrain
  theme: ThemeSetting;
}

const NO_WORKSPACES: Page<WorkspaceEntry> = { items: [], nextCursor: null };

export function initialLoadContext(devBrain: DevBrain | null): InitialLoadContext {
  if (devBrain === null) {
    return {
      devBrainAvailable: false,
      current: null,
      last: null,
      workspaces: NO_WORKSPACES,
      theme: 'system',
    };
  }
  const current = devBrain.currentWorkspace?.info ?? null;
  const lastId = current === null ? lastOpenedWorkspace(devBrain) : null;
  return {
    devBrainAvailable: true,
    current,
    last: lastId === null ? null : devBrain.workspaces.getById(lastId),
    workspaces: devBrain.workspaces.listAll(),
    theme: devBrain.settings.get('settings.theme'),
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
