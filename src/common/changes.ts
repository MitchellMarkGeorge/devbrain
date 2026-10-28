import type { EntityType } from './ids';

// A kind of row whose change the renderer refetches for. A mutation's response lists the ones it
// changed, and the `db.changes` event the ones changed outside any mutation (a sync page, work that
// finished after its response). Over-reporting only costs a refetch.
export type ChangedEntity = Extract<
  EntityType,
  'task' | 'note' | 'project' | 'event' | 'calendar' | 'integration' | 'externalSource'
>;
