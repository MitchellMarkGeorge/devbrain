import { z } from 'zod';
import type { WorkspaceId } from '../ids';

// What the app remembers for one workspace, beside its name and colour in its folder's manifest
// (workspace.json): what you last chose on a page, which is the workspace's own and moves with its
// folder. The settings file's `state` is the same for the whole DevBrain folder. Nothing here is
// shown in Settings: each value is changed where it is used.
export const workspaceStateSchema = z.object({
  calendar: z.object({
    // tasks with a due date are drawn on that day, beside the events (the Filter's "Tasks")
    showTasks: z.boolean(),
  }),
});

export type WorkspaceState = z.infer<typeof workspaceStateSchema>;

/** A workspace's state before anything is chosen. A new object each time: callers keep it. */
export function defaultWorkspaceState(): WorkspaceState {
  return { calendar: { showTasks: true } };
}

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
  // what the app remembers for this workspace (the calendar's Filter), kept in the manifest too
  state: WorkspaceState;
}
