export { DevBrain } from './devbrain';
export type { Workspace } from './workspace/workspace';
export type { WorkspaceInfo as WorkspaceEntry, CreateWorkspaceOptions } from './workspace/types';
export type { AppSettings, AppState } from './settings/types';

import { DevBrain } from './devbrain';
import { validateDevBrainFolderStructure } from './local/validate';
import { scaffoldDevBrain } from './local/scaffold';

export interface LoadOptions {
  path: string;
}

export interface InitOptions {
  path: string;
  overwrite?: boolean;
}

export async function loadDevBrain({ path }: LoadOptions) {
  // loads existing local devbrain structure and return DevBrain instance
  // validates that provided path has a valid localDevBrain file structure
  const result = await validateDevBrainFolderStructure(path);
  if (result.valid) {
    return new DevBrain(path);
  }
  throw new Error(result.error);
}

export async function initDevBrain({ path, overwrite }: InitOptions) {
  // creates local devbrain structure and return DevBrain instance
  await scaffoldDevBrain(path, overwrite ?? false);
  return new DevBrain(path);
}
