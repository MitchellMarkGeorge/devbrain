import { ipcMain } from 'electron';
import { IPC_BOOT_CHANNEL } from '@common/ipc/constants';
import type { DevBrain, WorkspaceEntry } from '@main/core';
import type { Page } from '@main/core/shared/pagination';
import { lastOpenedWorkspace } from '../runtime/start';

// What a page needs for its first render, so it shows the right screen at once rather than a
// loading state: the renderer seeds its query cache with it (src/renderer/ipc/boot.ts). Read again
// on every page load, so a reload sees the workspace open now. Workspace info only: names, colors
// and ids, never anything from a workspace's database.
export interface BootSnapshot {
  // false when DevBrain could not be loaded: nothing that needs it can run
  devBrainAvailable: boolean;
  // the open workspace: what workspaces.current answers
  current: WorkspaceEntry | null;
  // the workspace workspaces.openLast would open, while none is open: the splash shows it
  last: WorkspaceEntry | null;
  // what workspaces.list answers for its first page
  workspaces: Page<WorkspaceEntry>;
}

const NO_WORKSPACES: Page<WorkspaceEntry> = { items: [], nextCursor: null };

export function bootSnapshot(devBrain: DevBrain | null): BootSnapshot {
  if (devBrain === null) {
    return { devBrainAvailable: false, current: null, last: null, workspaces: NO_WORKSPACES };
  }
  const current = devBrain.currentWorkspace?.info ?? null;
  const lastId = current === null ? lastOpenedWorkspace(devBrain) : null;
  return {
    devBrainAvailable: true,
    current,
    last: lastId === null ? null : devBrain.workspaces.getById(lastId),
    workspaces: devBrain.workspaces.listAll(),
  };
}

/**
 * Answers the preload's synchronous boot message with `snapshot()`, or null when it throws (an
 * unreadable registry), so the page falls back to fetching. The renderer waits on the answer, so
 * one is always given. Returns the function that stops answering.
 */
export function attachBoot(
  snapshot: () => BootSnapshot,
  onError: (error: unknown) => void,
): () => void {
  const listener = (event: { returnValue: unknown }) => {
    try {
      event.returnValue = snapshot();
    } catch (error) {
      onError(error);
      event.returnValue = null;
    }
  };
  ipcMain.on(IPC_BOOT_CHANNEL, listener);
  return () => {
    ipcMain.removeListener(IPC_BOOT_CHANNEL, listener);
  };
}
