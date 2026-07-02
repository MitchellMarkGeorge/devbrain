import { z } from 'zod';
import { TaskPriority } from '../tasks/types';

export const appSettingsSchema = z.object({
  theme: z.literal('dark'),
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
    defaultDueDate: z.enum(['today', 'tommorow', 'nextWeek']),
    defaultView: z.enum(['list', 'group', 'board']),
    showCompletedTasks: z.boolean(),
  }),
  calendar: z.object({
    timezone: z.string(),
    defaultEventDuration: z.enum(['15m', '30m', '1h']),
    firstDayOfWeek: z.enum(['monday', 'sunday']),
    defaultView: z.enum(['month', 'week', 'day']),
  }),
});

export const appStateSchema = z.object({
  lastWorkspaceId: z.string().nullable(),
  lastPage: z.string().nullable(),
});

export const settingsFileSchema = z.object({
  settings: appSettingsSchema,
  state: appStateSchema,
});
