import { v7 as uuidv7 } from 'uuid';

export type EntityType = 'task' | 'note' | 'project' | 'event' | 'workspace';

const PREFIX: Record<EntityType, string> = {
  task: 'tsk',
  note: 'nte',
  project: 'prj',
  event: 'evt',
  workspace: 'wsp',
};

export type Id<T extends EntityType> = string & { readonly __entity: T };

export type TaskId = Id<'task'>;
export type NoteId = Id<'note'>;
export type ProjectId = Id<'project'>;
export type EventId = Id<'event'>;
export type WorkspaceId = Id<'workspace'>;

export function generateId<T extends EntityType>(type: T): Id<T> {
  return `${PREFIX[type]}_${uuidv7()}` as Id<T>;
}
