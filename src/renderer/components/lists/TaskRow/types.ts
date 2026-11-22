import type { TaskListItem } from '@common/types';

/**
 * The fields of core's `TaskListItem` a task row, a board card and a task list read. Pass a
 * `TaskListItem`, or a `SubtaskListItem` (a task's own subtasks, which name no parent), as it is.
 */
export type TaskRowData = Pick<
  TaskListItem,
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'subtaskProgress'
  | 'project'
  | 'link'
  | 'external'
> &
  Partial<Pick<TaskListItem, 'parentTask'>>;
