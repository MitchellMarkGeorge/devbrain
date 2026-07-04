// given a random date/time, return the days "range":
// start being the start of the day

import { Task } from './types';

// and end being the end of the day (midnight)
export function localDayWindow(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
}

export function isSubtask(task: Task) {
  return task.parentTaskId !== null;
}
