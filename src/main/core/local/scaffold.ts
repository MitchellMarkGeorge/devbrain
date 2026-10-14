import path from 'node:path';
import fs from 'fs/promises';
import { getDefaults } from '../settings/defaults';

/**
 * Creates a DevBrain folder at `rootPath`, which must not exist yet or be an empty directory (see
 * devBrainFolderState). Never deletes or overwrites anything: a settings.json or workspaces.json
 * that appeared in the meantime makes it throw.
 */
export async function scaffoldDevBrain(rootPath: string) {
  // 1. create the root directory, if it is not there
  await fs.mkdir(rootPath, { recursive: true });

  // 2. create the settings.json file with default values
  const settingsFilePath = path.join(rootPath, 'settings.json');
  const settingsFileContent = JSON.stringify(getDefaults(rootPath), null, 2);
  await fs.writeFile(settingsFilePath, settingsFileContent, { encoding: 'utf8', flag: 'wx' });

  // 3. create an empty workspaces.json registry
  const workspacesFilePath = path.join(rootPath, 'workspaces.json');
  await fs.writeFile(workspacesFilePath, JSON.stringify({}, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
  });
}
