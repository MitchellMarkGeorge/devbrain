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
 * listeners) attaches to it before openLastWorkspace opens one. Returns null when there is no
 * folder and none is to be created. Throws when the folder is invalid.
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
 * Opens the workspace open last time, which starts syncing it, when it is still registered.
 * Otherwise none is opened: the user picks one. Never throws: a workspace that fails to open (e.g.
 * a failed migration) is logged and leaves none open.
 */
export async function openLastWorkspace(
  devBrain: DevBrain,
  logger: Pick<SyncLogger, 'info' | 'warn'>,
): Promise<void> {
  const id = lastOpenedWorkspace(devBrain);
  if (id === null) {
    logger.info('No workspace was open last time; none opened');
    return;
  }
  try {
    const workspace = await devBrain.workspaces.open(id);
    logger.info(`Opened workspace ${workspace.info.id}`);
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    logger.warn(`Opening workspace ${id} failed error=${name}`);
  }
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
