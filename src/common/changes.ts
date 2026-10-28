import type { EntityType } from './ids';

// A kind of row whose change the renderer refetches for. A mutation's response lists the ones it
// changed, and the `db.changes` event the ones changed outside any mutation (a sync page, work that
// finished after its response). Over-reporting only costs a refetch. `workspace` is the registry of
// workspaces and `settings` the settings file, which no core service announces: their routes
// record them.
export type ChangedEntity =
  | Extract<
      EntityType,
      | 'task'
      | 'note'
      | 'project'
      | 'event'
      | 'calendar'
      | 'integration'
      | 'externalSource'
      | 'workspace'
    >
  | 'settings';
