import type { WorkspaceId } from '../ids';
import type { SerializedError } from '../ipc/types';

// A workspace as the registry lists it: never the open Workspace itself
export interface WorkspaceInfo {
  id: WorkspaceId;
  name: string;
  color: string;
  path: string;
  createdAt: number;
  lastOpenedAt: number | null;
  // the page the app was on when this workspace last closed, for "Reopen last page"; kept in its
  // folder's manifest, so it moves with the folder
  lastPage: string | null;
}

// What the window shows, as main says: onboarding while no workspace is open (with why the last
// open failed, if it did), the splash while one opens, and the app while one is open (with why a
// switch away from it failed, if it did). Main owns it and sends it whole at every change
// (`workspace.changed`); a switch goes opening → open, never through `none`.
export type WorkspaceState =
  | { status: 'none'; error: SerializedError | null }
  | { status: 'opening'; workspace: WorkspaceInfo }
  | { status: 'open'; workspace: WorkspaceInfo; error: SerializedError | null };

// The workspace state with a version that goes up at each change, so the newest of two is known
// (the preload's buffered copy against one read with the initial load context).
export interface WorkspaceSnapshot {
  version: number;
  state: WorkspaceState;
}
