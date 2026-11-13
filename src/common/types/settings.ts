import { z } from 'zod';
import { isId, type WorkspaceId } from '../ids';
import { TaskPriority } from './tasks';

// 'system' follows the operating system's light or dark appearance
export const themeSettingSchema = z.enum(['system', 'light', 'dark']);

// the keymap the app's keys follow: the default one, or Vim's
export const keyboardModeSchema = z.enum(['default', 'vim']);

export const appSettingsSchema = z.object({
  theme: themeSettingSchema,
  devBrainPath: z.string(),
  general: z.object({
    defaultLandingPage: z.enum(['home', 'tasks', 'notes', 'projects', 'calendar']),
    launchOnStartup: z.boolean(),
    openToLastPage: z.boolean(),
    confirmBeforeDeleting: z.boolean(),
    confirmBeforeArchiving: z.boolean(),
    timeFormat: z.enum(['12', '24']),
    // 'vim' turns the app's keys modal (Normal, Insert, Visual, …); off by default, as single-key
    // shortcuts must be able to be turned off (WCAG 2.1.4)
    keyboardMode: keyboardModeSchema,
  }),
  tasks: z.object({
    defaultSort: z.enum(['priority', 'dueDate', 'status']),
    defaultPriority: z.enum(TaskPriority),
    defaultDueDate: z.enum(['today', 'tomorrow', 'nextWeek']),
    defaultView: z.enum(['list', 'group', 'board']),
    showCompletedTasks: z.boolean(),
  }),
  // no time zone: dates follow the system zone (see shared/dates.ts)
  calendar: z.object({
    defaultEventDuration: z.enum(['15m', '30m', '1h']),
    firstDayOfWeek: z.enum(['monday', 'sunday']),
    defaultView: z.enum(['month', 'week', 'day']),
    // the week and month views show Monday to Friday only
    hideWeekends: z.boolean(),
  }),
});

// A page in a workspace, as main saves it in that workspace's manifest for "Reopen last page"
// (general.openToLastPage): the path from the window's URL, which names the workspace, with its
// search params, e.g. /app/wsp_…/tasks?view=board. Bounded, as it comes from the page. The renderer
// parses it again before navigating to it.
export const MAX_LAST_PAGE_LENGTH = 2048;
const PAGE_IN_WORKSPACE = /^\/app\/(wsp_[^/?#]+)(?:[/?#]|$)/;
export const lastPageSchema = z
  .string()
  .max(MAX_LAST_PAGE_LENGTH)
  .regex(PAGE_IN_WORKSPACE, 'Not a page in a workspace');

/** The workspace a page in the app belongs to (`/app/wsp_1/tasks` → `wsp_1`), or null. */
export function workspaceIdOfPage(page: string): WorkspaceId | null {
  const id = PAGE_IN_WORKSPACE.exec(page)?.[1];
  return id !== undefined && isId('workspace', id) ? id : null;
}

export const appStateSchema = z.object({
  lastWorkspaceId: z.string().nullable(),
});

export const settingsFileSchema = z.object({
  settings: appSettingsSchema,
  state: appStateSchema,
});

export type ThemeSetting = z.infer<typeof themeSettingSchema>;
export type KeyboardMode = z.infer<typeof keyboardModeSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type SettingsFile = z.infer<typeof settingsFileSchema>;
