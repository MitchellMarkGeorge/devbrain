import { z } from 'zod';
import { TaskPriority } from './tasks';

// 'system' follows the operating system's light or dark appearance
export const themeSettingSchema = z.enum(['system', 'light', 'dark']);

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

// A page in the app, as main saves it in a workspace's manifest for "Reopen last page"
// (general.openToLastPage): the /app path with its search params from the window's URL, e.g.
// /app/tasks?view=board. Bounded, as it comes from the page. The renderer parses it again before
// navigating to it.
export const MAX_LAST_PAGE_LENGTH = 2048;
export const lastPageSchema = z
  .string()
  .max(MAX_LAST_PAGE_LENGTH)
  .regex(/^\/app(?:[/?#]|$)/, 'Not a page in the app');

/** Whether `page` is a page in the app that a workspace can reopen on (`lastPageSchema`). */
export function isValidLastPage(page: unknown): page is string {
  return lastPageSchema.safeParse(page).success;
}

export const appStateSchema = z.object({
  lastWorkspaceId: z.string().nullable(),
});

export const settingsFileSchema = z.object({
  settings: appSettingsSchema,
  state: appStateSchema,
});

export type ThemeSetting = z.infer<typeof themeSettingSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type SettingsFile = z.infer<typeof settingsFileSchema>;
