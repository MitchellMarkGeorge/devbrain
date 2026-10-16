import path from 'node:path';
import fs from 'fs/promises';
import { getDefaults } from '../settings/defaults';
import { createFileAtomicSync } from './atomic';

/**
 * Creates a DevBrain folder at `rootPath`, which must not exist yet or be an empty directory (see
 * devBrainFolderState). Never deletes or overwrites anything: a settings.json or workspaces.json
 * that appeared in the meantime makes it throw. Each file is created whole or not at all, so a crash
 * cannot leave a partial one behind.
 */
export async function scaffoldDevBrain(rootPath: string) {
  // 1. create the root directory, if it is not there
  await fs.mkdir(rootPath, { recursive: true });

  // 2. create the settings.json file with default values
  const settingsFilePath = path.join(rootPath, 'settings.json');
  const settingsFileContent = JSON.stringify(getDefaults(rootPath), null, 2);
  createFileAtomicSync(settingsFilePath, settingsFileContent);

  // 3. create an empty workspaces.json registry
  const workspacesFilePath = path.join(rootPath, 'workspaces.json');
  createFileAtomicSync(workspacesFilePath, JSON.stringify({}, null, 2));
}
