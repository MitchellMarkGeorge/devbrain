import os from 'node:os';
import path from 'node:path';
import { TaskPriority } from '../tasks/types';
import { SettingsFile } from './types';

export const DEFAULTS: SettingsFile = {
  settings: {
    theme: 'dark',
    devBrainPath: process.env.DEVBRAIN_PATH ?? path.join(os.homedir(), '.devbrain'),
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
      timezone: 'Toronto UTC', // come back to this
    },
  },
  state: {
    lastPage: null,
    lastWorkspaceId: null,
  },
};
