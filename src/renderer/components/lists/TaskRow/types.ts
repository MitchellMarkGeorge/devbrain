import type { Priority, Provider, Swatch, TaskStatus } from '../../types';

/** A task as a row, a board card or a list shows it. */
export interface Task {
  /** identifies the row in a `TaskList` (selection, keys); the index is used when left out */
  id?: string;
  title: string;
  status: TaskStatus;
  /** a synced task's key ("ENG-124"), shown with its provider's logo in a SourcePill */
  key?: string;
  /** where a synced task comes from (default `linear`) */
  source?: Provider;
  /** a subtask's parent title: shown as the parent pill after the title */
  parent?: string;
  /** the parent's status, for the parent pill's icon */
  parentStatus?: TaskStatus;
  /** subtasks done and in total: `[3, 4]` */
  subtasks?: [done: number, total: number];
  project?: string;
  projectColor?: Swatch | string;
  event?: string;
  eventColor?: Swatch | string;
  note?: string;
  priority: Priority;
  /** the due date as shown: "Today", "Sep 28" */
  date?: string;
  dateTone?: 'today' | 'overdue';
  selected?: boolean;
}
