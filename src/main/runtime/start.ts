import type { WorkspaceId } from '@common/ids';
import { DevBrain, openDevBrain, type OpenSettingsStore, type WorkspaceOptions } from '@main/core';
import { DevBrainFolderError } from '@main/core/shared/errors';
import type { SyncLogger } from '@main/core/sync/types';

export interface LoadDevBrainOptions {
  // the DevBrain folder: settings.json, workspaces.json and the workspaces
  rootPath: string;
  // Creates a DevBrain folder when there is none (or only an empty directory), as on the packaged
  // app's first run. Off in development, where the folder comes from `npm run seed:dev`.
  createIfMissing: boolean;
  // opens the folder's settings file: electron-store in the app
  settingsStore: OpenSettingsStore;
  // the cipher, fetch and browser opener every workspace gets
  workspace: WorkspaceOptions;
  logger: Pick<SyncLogger, 'warn'>;
}

/**
 * Opens the DevBrain folder, and no workspace: whatever follows DevBrain (sync triggers, change
 * listeners) attaches to it before the renderer opens the one its route names. Returns null when
 * there is no folder and none is to be created. Throws when the folder is invalid.
 */
export async function loadDevBrain(options: LoadDevBrainOptions): Promise<DevBrain | null> {
  try {
    return await openDevBrain({
      path: options.rootPath,
      settingsStore: options.settingsStore,
      createIfMissing: options.createIfMissing,
      workspace: options.workspace,
    });
  } catch (error) {
    if (!(error instanceof DevBrainFolderError && error.reason === 'missing')) throw error;
    options.logger.warn(
      `No DevBrain folder at ${options.rootPath}; run \`npm run seed:dev\` to create one`,
    );
    return null;
  }
}

/**
 * The workspace open last time, from `state.lastWorkspaceId`, while it is still registered: the
 * one the window opens on (runtime/last-page.ts, initialRoute). Null when none was recorded or it
 * has been deleted since.
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
