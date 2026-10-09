import type { TaskPage } from '../integrations/providers/provider';

// what SyncWriter.applyTaskPage takes: the items of a pulled page, or of a lookup result
export type TaskPageItems = Pick<TaskPage, 'projects' | 'tasks' | 'removedIds'>;

// the entity types a write touched, so the renderer refetches only those queries
export type SyncEntityType = 'task' | 'project';

// what one writer call did; the engine passes it to its progress callback
export interface SyncSummary {
  // new entities, each with a new link
  inserted: number;
  // entities whose provider-owned fields were written, restored ones included
  updated: number;
  // entities archived because they left scope
  removed: number;
  changed: SyncEntityType[];
}
