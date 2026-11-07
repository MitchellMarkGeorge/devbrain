import type { WorkspaceId } from '../ids';

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

// Which workspace is open (null while none is), and which is opening (null when none is): from an
// open's start until it is open or has failed. What `workspace.changed` sends and
// `workspaces.status` answers.
export interface WorkspaceStatus {
  id: WorkspaceId | null;
  opening: WorkspaceId | null;
}
