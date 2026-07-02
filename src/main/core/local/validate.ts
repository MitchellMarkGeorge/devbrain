import fs from 'fs/promises';
import path from 'node:path';
import { isErrnoException, isNotFound } from './utils';
import { settingsFileSchema } from '../settings/schema';
import { workspaceRegistrySchema } from '../workspace/schema';

export type ValidationResult = { valid: true } | { valid: false; error: string };

export async function validateDevBrainFolderStructure(rootPath: string): Promise<ValidationResult> {
  // 1. must be an absolute path
  if (rootPath && !path.isAbsolute(rootPath)) {
    return { valid: false, error: 'Provided rootPath must be absolute' };
  }

  // 2. path must exist, be accessible, and be a directory
  let rootPathStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    rootPathStat = await fs.stat(rootPath);
  } catch (error) {
    if (isErrnoException(error)) {
      if (error.code === 'ENOENT') {
        return { valid: false, error: 'Provided rootPath does not exist in file system' };
      }
      return { valid: false, error: `Unable to access provided rootPath: ${error.message}` };
    }
    return { valid: false, error: `Unexpected error occured: ${error}` };
  }

  if (!rootPathStat.isDirectory()) {
    return { valid: false, error: 'Provided rootPath must be a directory' };
  }

  // 3. valid settings file must exist
  const settingFilePath = path.join(rootPath, 'settings.json');
  let parsedSettings: unknown;
  try {
    parsedSettings = JSON.parse(await fs.readFile(settingFilePath, 'utf8'));
  } catch (error) {
    if (isNotFound(error))
      return { valid: false, error: 'No settings.json file in provided rootPath' };
    return { valid: false, error: 'settings.json is not valid JSON' };
  }

  const result = settingsFileSchema.safeParse(parsedSettings);

  if (!result.success) {
    return { valid: false, error: 'Invalid settings.json file' };
  }

  // 4. valid workspaces registry file must exist
  const workspacesFilePath = path.join(rootPath, 'workspaces.json');
  let parsedRegistry: unknown;
  try {
    parsedRegistry = JSON.parse(await fs.readFile(workspacesFilePath, 'utf8'));
  } catch (error) {
    if (isNotFound(error))
      return { valid: false, error: 'No workspaces.json file in provided rootPath' };
    return { valid: false, error: 'workspaces.json is not valid JSON' };
  }

  const registryResult = workspaceRegistrySchema.safeParse(parsedRegistry);
  if (!registryResult.success) {
    return { valid: false, error: 'Invalid workspaces.json file' };
  }

  // 5. validate other paths in folder (can only have workspaces)
  // 5. validate workspace folders
  //   const rootPathDir = await fs.opendir(rootPath);

  //   for await (const item of rootPathDir) {
  //     if (isJunk(item.name)) continue;
  //     if (item.name === "settings.json" && item.isFile()) continue;
  //     // only allowed directories are the workspaces
  //     if (item.isDirectory() && !['workspaces', 'logs'].includes(item.name))
  //   }

  return { valid: true };
}
