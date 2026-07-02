import { z } from 'zod';
import { appSettingsSchema, appStateSchema, settingsFileSchema } from './schema';

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type SettingsFile = z.infer<typeof settingsFileSchema>;

// All valid dot-separated key paths in T (arrays are not traversed)
export type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends unknown[]
    ? K
    : T[K] extends Record<string, unknown>
      ? K | `${K}.${DotPaths<T[K]>}`
      : K;
}[keyof T & string];

// Value type at a given dot path P within T
export type DotPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? DotPathValue<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

// // this should produce or be a product of the schema validator
// export interface AppSettings {
//   theme: 'dark'; // v1 is dark-only
//   devBrainPath: string
//   general: {
//     defaultLandingPage: 'home' | 'tasks' | 'notes' | 'projects' | 'calendar'
//     launchOnStartup: boolean;
//     openToLastPage: boolean;
//     confirmBeforeDeleting: boolean;
//     confirmBeforeArchiving: boolean;
//     timeFormat: '12' | '24'
//   }
//   tasks: {
//     defaultSort: 'priority' | 'dueDate' | 'status';
//     defaultPriority: TaskPriority;
//     defaultDueDate: 'today' | 'tommorow' | 'nextWeek';
//     defaultView: 'list' | 'group' | 'board';
//     showCompletedTasks: boolean;
//   };
//   calendar: {
//     timezone: string;
//     defaultEventDuration: '15m' | '30m' | '1h';
//     firstDayOfWeek: 'monday' | 'sunday';
//     defaultView: 'month' | 'week' | 'day';
//   };
// }

// export interface AppState {
//   lastWorkspaceId: string | null;
//   lastPage: string | null;
// }

// export interface StoreSchema {
//   settings: AppSettings;
//   state: AppState;
//   workspaces: WorkspaceEntry[];
// }
