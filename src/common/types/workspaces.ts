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

// What the window shows for the workspaces, as main says: onboarding while none is open (with why
// the last open failed, if it did), the splash while one opens, and the app while one is open (with
// why a switch away from it failed, if it did: a missing folder fails before anything closes).
export type WorkspaceState =
  | { status: 'none'; error: SerializedError | null }
  | { status: 'opening'; workspace: WorkspaceInfo }
  | { status: 'open'; workspace: WorkspaceInfo; error: SerializedError | null };

// The state with a number main raises at every change, so a page keeps the newest it has seen
// whatever order the initial read and the events arrive in.
export interface WorkspaceSnapshot {
  version: number;
  state: WorkspaceState;
}
