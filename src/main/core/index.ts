export { DevBrain } from './devbrain';
export type { Workspace } from './workspace/workspace';
export type {
  WorkspaceInfo as WorkspaceEntry,
  CreateWorkspaceOptions,
  WorkspaceOptions,
} from './workspace/types';
export type { AppSettings, AppState } from './settings/types';
export type { OpenSettingsStore, SettingsStore } from './settings/store';
export type { Logger } from './shared/logger';
export { InvalidCursorError } from './shared/pagination';
export type { Page, PageOptions } from './shared/pagination';

import { DevBrain, type OpenDevBrainOptions } from './devbrain';

export type { OpenDevBrainOptions } from './devbrain';

// opens, or with `createIfMissing` creates, the DevBrain folder at `path`; see DevBrain.open
export function openDevBrain(options: OpenDevBrainOptions): Promise<DevBrain> {
  return DevBrain.open(options);
}
