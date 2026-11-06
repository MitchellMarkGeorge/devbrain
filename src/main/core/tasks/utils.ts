// given a random date/time, return the days "range":
// start being the start of the day

import { Task } from '@common/types';

export function isSubtask(task: Task) {
  return task.parentTaskId !== null;
}
