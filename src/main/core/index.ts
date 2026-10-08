export { DevBrain } from './devbrain';
export type { Workspace } from './workspace/workspace';
export type {
  WorkspaceInfo as WorkspaceEntry,
  CreateWorkspaceOptions,
  WorkspaceOptions,
} from './workspace/types';
export type { AppSettings, AppState } from './settings/types';
export { InvalidCursorError } from './shared/pagination';
export type { Page, PageOptions } from './shared/pagination';

import { DevBrain } from './devbrain';
import { validateDevBrainFolderStructure } from './local/validate';
import { scaffoldDevBrain } from './local/scaffold';
import type { WorkspaceOptions } from './workspace/types';

export interface LoadOptions {
  path: string;
  workspace?: WorkspaceOptions;
}

export interface InitOptions {
  path: string;
  overwrite?: boolean;
  workspace?: WorkspaceOptions;
}

export async function loadDevBrain({ path, workspace }: LoadOptions) {
  // loads existing local devbrain structure and return DevBrain instance
  // validates that provided path has a valid localDevBrain file structure
  const result = await validateDevBrainFolderStructure(path);
  if (result.valid) {
    return new DevBrain(path, workspace);
  }
  throw new Error(result.error);
}

export async function initDevBrain({ path, overwrite, workspace }: InitOptions) {
  // creates local devbrain structure and return DevBrain instance
  await scaffoldDevBrain(path, overwrite ?? false);
  return new DevBrain(path, workspace);
}
