import { queryOptions, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { ipc, trpc } from '@renderer/ipc';

// The content queries: the text each rich text editor shows, as stored (docs/editor.md). A note's
// is `notes.readContent`; a task's, project's or event's description is read through its `get`
// route, under a key of its own (`[['content', 'task'], { id }]`), so that only `content` refetches
// it (src/renderer/ipc/query-invalidator.ts). Core reports `content` only when something other
// than the editor rewrote the text (a sync, a reattach); an editor's save writes the cache itself
// (`useEditorAutosave`), and is never refetched. So they never go stale on their own: a page that
// mounts one reads the cache, primed by its loader (from the entity it read: `primeContent`).

/** A note's markdown, from its file. */
export function noteContentQuery(id: NoteId) {
  return trpc.notes.readContent.queryOptions({ id }, { staleTime: Infinity });
}

// the entities whose description an editor shows
type DescriptionOf = 'task' | 'project' | 'event';
type DescriptionKey = readonly [readonly ['content', DescriptionOf], { readonly id: string }];

// a description's content query: the entity read through its `get` route, keeping `description`
function descriptionQuery(
  of: DescriptionOf,
  id: string,
  read: () => Promise<{ description: string | null }>,
) {
  return queryOptions({
    queryKey: [['content', of], { id }] as DescriptionKey,
    queryFn: async () => (await read()).description ?? '',
    staleTime: Infinity,
  });
}

/** A task's description, `''` for none. */
export function taskContentQuery(id: TaskId) {
  return descriptionQuery('task', id, () => ipc.tasks.get.query({ id }));
}

/** A project's description, `''` for none. */
export function projectContentQuery(id: ProjectId) {
  return descriptionQuery('project', id, () => ipc.projects.get.query({ id }));
}

/** An event's description, `''` for none. */
export function eventContentQuery(id: EventId) {
  return descriptionQuery('event', id, () => ipc.events.get.query({ id }));
}

/**
 * Primes a description's content query from the entity a page's loader read (`tasks.get`,
 * `projects.get`, under `entityKey`), so opening the page reads the entity once. Only when the
 * content isn't cached, as a cached one holds the editor's latest save, and only from an entity
 * whose query is current: an invalidated one may hold text older than a save or a sync, so the
 * content query reads it again itself then.
 */
export async function primeContent(
  queryClient: QueryClient,
  content: ReturnType<typeof descriptionQuery>,
  entityKey: QueryKey,
  description: string | null,
): Promise<void> {
  if (queryClient.getQueryData(content.queryKey) !== undefined) return;
  if (queryClient.getQueryState(entityKey)?.isInvalidated) {
    await queryClient.query({ ...content, staleTime: 'static' });
    return;
  }
  queryClient.setQueryData(content.queryKey, description ?? '');
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
