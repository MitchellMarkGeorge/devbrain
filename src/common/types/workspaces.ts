import { z } from 'zod';
import type { WorkspaceId } from '../ids';

// A workspace's own settings, beside its name and colour in its folder's manifest (workspace.json):
// what depends on what is in the workspace, so each workspace has its own and they move with its
// folder. The settings file's `settings` (AppSettings) are the same for every workspace. One may be
// changed on the page it is about (the calendar's Filter) rather than in Settings.
export const workspaceSettingsSchema = z.object({
  calendar: z.object({
    // tasks with a due date are drawn on that day, beside the events (the Filter's "Tasks")
    showTasks: z.boolean(),
  }),
});

export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

/** A workspace's settings before any is changed. A new object each time: callers keep it. */
export function defaultWorkspaceSettings(): WorkspaceSettings {
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
  // the workspace's own settings (the calendar's "Tasks" filter), kept in the manifest too
  settings: WorkspaceSettings;
}
