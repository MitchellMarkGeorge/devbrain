// given a random date/time, return the days "range":
// start being the start of the day

import { Task } from '@common/types';

export function isSubtask(task: Task) {
  return task.parentTaskId !== null;
}

// A duplicate's title, so the copy is told apart from the original in lists, search and recents.
// An untitled note's copy stays untitled.
export function copyTitle(title: string): string {
  return title.trim() ? `Copy of ${title}` : title;
}
