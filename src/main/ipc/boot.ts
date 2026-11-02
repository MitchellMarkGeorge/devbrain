import { ipcMain } from 'electron';
import type { IpcMainEvent } from 'electron';
import type { WorkspaceId } from '@common/ids';
import { IPC_BOOT_CHANNEL } from '@common/ipc/constants';
import type { DevBrain, Page, WorkspaceEntry } from '@main/core';
import { lastOpenedWorkspace } from '../runtime/start';

export interface BootSnapshot {
  devBrainAvailable: boolean;
  current: WorkspaceEntry | null;
  last: WorkspaceId | null;
  workspaces: Page<WorkspaceEntry> | null;
}

/** The workspace-only state a page needs to choose its first screen. */
export function bootSnapshot(devBrain: DevBrain | null): BootSnapshot {
  if (devBrain === null) {
    return { devBrainAvailable: false, current: null, last: null, workspaces: null };
  }
  return {
    devBrainAvailable: true,
    current: devBrain.currentWorkspace?.info ?? null,
    last: lastOpenedWorkspace(devBrain),
    workspaces: devBrain.workspaces.listAll(),
  };
}

/** Registers the one synchronous IPC read. Returns the function that removes it. */
export function attachBoot(devBrain: DevBrain | null): () => void {
  const answer = (event: IpcMainEvent): void => {
    try {
      event.returnValue = bootSnapshot(devBrain);
    } catch {
      // sendSync must always be answered; the renderer falls back to its ordinary async flow.
      event.returnValue = null;
    }
  };
  ipcMain.on(IPC_BOOT_CHANNEL, answer);
  return () => ipcMain.removeListener(IPC_BOOT_CHANNEL, answer);
}
