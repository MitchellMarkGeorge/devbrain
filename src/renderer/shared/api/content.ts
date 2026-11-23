import { queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { ipc, trpc } from '@renderer/ipc';

// The content queries: the text each rich text editor shows, as stored (docs/editor.md). A note's
// is `notes.readContent`; a task's, project's or event's description is read through its `get`
// route, under a key of its own (`[['content', 'task'], { id }]`), so that only `content` refetches
// it (src/renderer/ipc/query-invalidator.ts). Core reports `content` only when something other
// than the editor rewrote the text (a sync, a reattach); an editor's save writes the cache itself
// (`useEditorAutosave`), and is never refetched. So they never go stale on their own: a page that
// mounts one reads the cache, primed by its loader.

/** A note's markdown, from its file. */
export function noteContentQuery(id: NoteId) {
  return trpc.notes.readContent.queryOptions({ id }, { staleTime: Infinity });
}

/** A task's description, `''` for none. */
export function taskContentQuery(id: TaskId) {
  return queryOptions({
    queryKey: [['content', 'task'], { id }] as const,
    queryFn: async () => (await ipc.tasks.get.query({ id })).description ?? '',
    staleTime: Infinity,
  });
}

/** A project's description, `''` for none. */
export function projectContentQuery(id: ProjectId) {
  return queryOptions({
    queryKey: [['content', 'project'], { id }] as const,
    queryFn: async () => (await ipc.projects.get.query({ id })).description ?? '',
    staleTime: Infinity,
  });
}

/** An event's description, `''` for none. */
export function eventContentQuery(id: EventId) {
  return queryOptions({
    queryKey: [['content', 'event'], { id }] as const,
    queryFn: async () => (await ipc.events.get.query({ id })).description ?? '',
    staleTime: Infinity,
  });
}

/**
 * Puts the text an editor saved, as stored, in its content query, so the editor reads its own save
 * back from the cache (and a page left and opened again shows it) without refetching it. A
 * refetch already in flight (one for a change from outside, which started before this save) is
 * cancelled: its answer would be older than the save.
 */
export function storeContent(queryClient: QueryClient, queryKey: QueryKey, text: string): void {
  // set first: the cancel puts back the state as of the last write, which is now this one
  queryClient.setQueryData(queryKey, text);
  void queryClient.cancelQueries({ queryKey, exact: true });
}
