import type { TaskListItem } from '@common/types';

/**
 * The fields of core's `TaskListItem` a task row, a board card and a task list read. Pass a
 * `TaskListItem` (or a `SubtaskListItem` with `parentTask: null`) as it is.
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
  | 'parentTask'
  | 'external'
>;
