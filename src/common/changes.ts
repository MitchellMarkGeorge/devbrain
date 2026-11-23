import type { EntityType } from './ids';

// A kind of row whose change the renderer refetches for. A mutation's response lists the ones it
// changed, and the `db.changes` event the ones changed outside any mutation (a sync page, work that
// finished after its response). Over-reporting only costs a refetch. `workspace` is the registry
// or which workspace is open: the renderer refetches the workspace list for it, and learns which
// workspace is open from the `workspace.changed` event (src/renderer/ipc/query-invalidator.ts).
// `recent` is not a kind of row: it says a task, project, note or event was viewed, which only the
// recents list reads, so a view doesn't refetch every list of that entity. `settings` is the app's
// settings, outside any workspace (the theme, the time format). `content` is the text an editor
// shows (a note's markdown, a task's, project's or event's description), reported only when
// something other than the editor rewrote it: a sync run, a reattach. An editor's own save reports
// its entity alone, so the lists refetch but the editor's text doesn't come back to it
// (docs/editor.md).
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
  | 'recent'
  | 'settings'
  | 'content';
