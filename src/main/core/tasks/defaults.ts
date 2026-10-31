import { TaskPriority } from './types';

// the task settings a task made without them takes (AppSettings.tasks): what an import fills
// missing values from
export interface TaskDefaults {
  defaultDueDate: 'today' | 'tomorrow' | 'nextWeek';
  defaultPriority: TaskPriority;
}

export const FALLBACK_TASK_DEFAULTS: TaskDefaults = {
  defaultDueDate: 'today',
  defaultPriority: TaskPriority.LOW,
};

const DAYS_AHEAD: Record<TaskDefaults['defaultDueDate'], number> = {
  today: 0,
  tomorrow: 1,
  nextWeek: 7,
};

// The day the defaultDueDate setting names, counted from `now`'s local day: the start of that day,
// as a task's due date is stored. "nextWeek" is a week from today.
export function resolveDefaultDueDate(
  setting: TaskDefaults['defaultDueDate'],
  now: Date = new Date(),
): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD[setting]);
}
