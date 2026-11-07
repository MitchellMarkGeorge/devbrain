import type { WorkspaceId } from '@common/ids';
import {
  DevBrain,
  openDevBrain,
  type OpenSettingsStore,
  type Workspace,
  type WorkspaceOptions,
} from '@main/core';

export interface LoadDevBrainOptions {
  // the DevBrain folder: settings.json, workspaces.json and the workspaces. Created when there is
  // none (or only an empty directory), on the first run, in development as in the packaged app
  rootPath: string;
  // opens the folder's settings file: electron-store in the app
  settingsStore: OpenSettingsStore;
  // the cipher, fetch and browser opener every workspace gets
  workspace: WorkspaceOptions;
}

/**
 * Opens the DevBrain folder, creating it when there is none, and no workspace: whatever follows
 * DevBrain (sync triggers, change listeners) attaches to it before startup opens one
 * (openLastWorkspace). Throws when the folder is invalid.
 */
export function loadDevBrain(options: LoadDevBrainOptions): Promise<DevBrain> {
  return openDevBrain({
    path: options.rootPath,
    settingsStore: options.settingsStore,
    createIfMissing: true,
    workspace: options.workspace,
  });
}

/**
 * Opens the workspace open last time, which starts syncing it, when it is still registered and no
 * workspace is open yet. Startup calls it, without waiting, just before it creates the window.
 * Returns the open workspace: the one already open when there is one, so it never reopens it.
 * Null when none was open last time or it has been deleted since: the user picks one.
 * Throws when the workspace fails to open (e.g. a failed migration), leaving none open.
 */
export function openLastWorkspace(devBrain: DevBrain): Promise<Workspace | null> {
  return devBrain.workspaces.openIfNoneOpen(() => lastOpenedWorkspace(devBrain));
}

/**
 * The workspace open last time, from `state.lastWorkspaceId`, while it is still registered. Null
 * when none was recorded or it has been deleted since.
 */
export function lastOpenedWorkspace(devBrain: DevBrain): WorkspaceId | null {
  const lastId = devBrain.settings.get('state.lastWorkspaceId') as WorkspaceId | null;
  if (lastId === null) return null;
  try {
    return devBrain.workspaces.getById(lastId).id;
  } catch {
    // deleted since, or from another DevBrain folder
    return null;
  }
}
