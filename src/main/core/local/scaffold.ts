import path from 'node:path';
import { directoryExists } from './utils';
import fs from 'fs/promises';
import { DEFAULTS } from '../settings/defaults';

export async function scaffoldDevBrain(rootPath: string, overwrite: boolean) {
  // 1. check if the directory exists and if is should overwrite
  const rootPathExists = await directoryExists(rootPath);
  if (rootPathExists && !overwrite) {
    throw new Error('Provided directory at rootPath already exists');
  }

  // 2. delete the existing directory given overwite is enabled
  if (rootPathExists) {
    await fs.rm(rootPath, { recursive: true, force: true });
  }

  // 3. create rood directory path
  await fs.mkdir(rootPath, { recursive: true });

  // 4. create the settings.json file with default values
  const settingsFilePath = path.join(rootPath, 'settings.json');
  const settingsFileContent = JSON.stringify(DEFAULTS, null, 2);
  await fs.writeFile(settingsFilePath, settingsFileContent, { encoding: 'utf8' });

  // 5. create an empty workspaces.json registry
  const workspacesFilePath = path.join(rootPath, 'workspaces.json');
  await fs.writeFile(workspacesFilePath, JSON.stringify({}, null, 2), { encoding: 'utf8' });
}
