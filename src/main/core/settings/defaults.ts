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
      },
    },
    state: {
      lastPage: null,
      lastWorkspaceId: null,
    },
  };
}
