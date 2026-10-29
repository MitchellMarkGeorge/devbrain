import { v7 as uuidv7 } from 'uuid';

export type EntityType =
  | 'task'
  | 'note'
  | 'project'
  | 'event'
  | 'calendar'
  | 'workspace'
  | 'integration'
  | 'externalSource'
  | 'externalLink';

const PREFIX: Record<EntityType, string> = {
  task: 'tsk',
  note: 'nte',
  project: 'prj',
  event: 'evt',
  calendar: 'cal',
  workspace: 'wsp',
  integration: 'int',
  externalSource: 'src',
  externalLink: 'xln',
};

export type Id<T extends EntityType> = string & { readonly __entity: T };

export type TaskId = Id<'task'>;
export type NoteId = Id<'note'>;
export type ProjectId = Id<'project'>;
export type EventId = Id<'event'>;
export type CalendarId = Id<'calendar'>;
export type WorkspaceId = Id<'workspace'>;
export type IntegrationId = Id<'integration'>;
export type ExternalSourceId = Id<'externalSource'>;
export type ExternalLinkId = Id<'externalLink'>;

// whether `value` has the shape of an id of this type: its prefix, then anything. Checks the shape
// only, never that the row exists
export function isId<T extends EntityType>(type: T, value: unknown): value is Id<T> {
  return (
    typeof value === 'string' &&
    value.startsWith(`${PREFIX[type]}_`) &&
    value.length > PREFIX[type].length + 1
  );
}

export function generateId<T extends EntityType>(type: T): Id<T> {
  return `${PREFIX[type]}_${uuidv7()}` as Id<T>;
}
