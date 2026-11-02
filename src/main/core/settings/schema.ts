import { z } from 'zod';
import { TaskPriority } from '../tasks/types';

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
  }),
});

export const appStateSchema = z.object({
  lastWorkspaceId: z.string().nullable(),
  lastPage: z.string().nullable(),
  // set once a settings file from before the system theme has been moved to it. Optional: such a
  // file lacks it, and electron-store fills in only the top-level keys a file lacks
  systemThemeApplied: z.boolean().optional(),
});

export const settingsFileSchema = z.object({
  settings: appSettingsSchema,
  state: appStateSchema,
});
