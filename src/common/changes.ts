import type { EntityType } from './ids';

// A kind of row whose change the renderer refetches for. A mutation's response lists the ones it
// changed, and the `db.changes` event the ones changed outside any mutation (a sync page, work that
// finished after its response). Over-reporting only costs a refetch. `workspace` is the registry
// or which workspace is open: the renderer refetches the workspace list for it, and learns which
// workspace is open from the `workspace.changed` event (src/renderer/ipc/query-invalidator.ts).
// `recent` is not a kind of row: it says a task, project, note or event was viewed, which only the
// recents list reads, so a view doesn't refetch every list of that entity.
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
  | 'recent';
