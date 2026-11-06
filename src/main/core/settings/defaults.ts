import os from 'node:os';
import path from 'node:path';
import { SettingsFile, TaskPriority } from '@common/types';

export function getDefaults(rootPath?: string): SettingsFile {
  const devBrainPath = rootPath
    ? rootPath
    : (process.env.DEVBRAIN_PATH ?? path.join(os.homedir(), '.devbrain'));
  return {
    settings: {
      theme: 'system',
      devBrainPath,
      general: {
        defaultLandingPage: 'home',
        launchOnStartup: false,
        openToLastPage: true,
        timeFormat: '12',
        confirmBeforeArchiving: true,
        confirmBeforeDeleting: true,
      },
      tasks: {
        defaultSort: 'priority',
        defaultView: 'list',
        defaultDueDate: 'today',
        defaultPriority: TaskPriority.LOW,
        showCompletedTasks: false,
      },
      calendar: {
        defaultEventDuration: '15m',
        defaultView: 'week',
        firstDayOfWeek: 'monday',
        hideWeekends: false,
      },
    },
    state: {
      lastWorkspaceId: null,
    },
  };
}

/**
 * `stored` with every key it lacks taken from `defaults`, at any depth; what it has is kept, even
 * where it doesn't match the defaults' shape. A settings file written before a setting was added
 * lacks that setting, inside its group (`settings.calendar` without `hideWeekends`), and
 * electron-store fills in defaults only at the top level.
 */
export function withDefaults(stored: unknown, defaults: unknown): unknown {
  if (stored === undefined) return defaults;
  if (!isRecord(stored) || !isRecord(defaults)) return stored;
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(defaults)) {
    merged[key] = withDefaults(stored[key], value);
  }
  return merged;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
