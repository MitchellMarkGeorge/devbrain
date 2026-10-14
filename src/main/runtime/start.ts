import type { WorkspaceId } from '@common/ids';
import { DevBrain, openDevBrain, type WorkspaceOptions } from '@main/core';
import { DevBrainFolderError } from '@main/core/shared/errors';
import type { SyncLogger } from '@main/core/sync/types';

export interface StartDevBrainOptions {
  // the DevBrain folder: settings.json, workspaces.json and the workspaces
  rootPath: string;
  // Creates a DevBrain folder when there is none (or only an empty directory), as on the packaged
  // app's first run. Off in development, where the folder comes from `npm run seed:dev`.
  createIfMissing: boolean;
  // the cipher, fetch and browser opener every workspace gets
  workspace: WorkspaceOptions;
  logger: Pick<SyncLogger, 'info' | 'warn'>;
}

/**
 * Loads the DevBrain folder and opens a workspace, which starts syncing it. Returns null when there
 * is no folder and none is to be created. Throws when the folder is invalid. A workspace that fails
 * to open (e.g. a failed migration) is logged and leaves DevBrain with none open.
 */
export async function startDevBrain(options: StartDevBrainOptions): Promise<DevBrain | null> {
  const { rootPath, logger } = options;
  let devBrain: DevBrain;
  try {
    devBrain = await openDevBrain({
      path: rootPath,
      createIfMissing: options.createIfMissing,
      workspace: options.workspace,
    });
  } catch (error) {
    if (!(error instanceof DevBrainFolderError && error.reason === 'missing')) throw error;
    logger.warn(`No DevBrain folder at ${rootPath}; run \`npm run seed:dev\` to create one`);
    return null;
  }

  const id = pickWorkspace(devBrain);
  if (id === null) {
    logger.info(`No workspace to open in ${rootPath}`);
    return devBrain;
  }
  try {
    const workspace = await devBrain.workspaces.open(id);
    devBrain.settings.set('state.lastWorkspaceId', id);
    logger.info(`Opened workspace ${workspace.info.id}`);
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    logger.warn(`Opening workspace ${id} failed error=${name}`);
  }
  return devBrain;
}

/**
 * The workspace to open at start: the last one opened, if it is still registered; else the oldest.
 * Null when there are none. A seeded dev folder records its workspace as the last one opened.
 */
export function pickWorkspace(devBrain: DevBrain): WorkspaceId | null {
  const workspaces = devBrain.workspaces;
  const lastId = devBrain.settings.get('state.lastWorkspaceId') as WorkspaceId | null;
  if (lastId !== null) {
    try {
      return workspaces.getById(lastId).id;
    } catch {
      // deleted since, or from another DevBrain folder
    }
  }
  return workspaces.listAll({ limit: 1 }).items[0]?.id ?? null;
}
