/** Domain presentation values. Core data is adapted by the consuming view. */
export type TaskStatus = 'not-started' | 'in-progress' | 'completed' | 'overdue' | 'cancelled';
export type Priority = 'high' | 'medium' | 'low';
export type Health = 'on-track' | 'at-risk' | 'off-track' | 'not-started' | 'completed';
export type Swatch = 'red' | 'amber' | 'green' | 'blue' | 'indigo' | 'pink';

export interface Task {
  title: string;
  status: TaskStatus;
  key?: string;
  /** where a synced task comes from; shown with its key in a SourcePill (default linear) */
  source?: 'linear' | 'github';
  /** a subtask's parent: shown as the parent pill after the title */
  parent?: string;
  subtasks?: [number, number];
  project?: string;
  projectColor?: string;
  event?: string;
  eventColor?: string;
  note?: string;
  priority: Priority;
  date?: string;
  dateTone?: 'today' | 'overdue';
  selected?: boolean;
}
