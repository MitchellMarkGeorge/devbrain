import type { NoteId } from '@common/ids';
import { TaskStatus } from '@common/types';
import { trpc } from '@renderer/ipc';
import type { NoteListInput } from './search';

// The notes pages' reads (docs/renderer/implementation-plan.md, "How the infinite lists work").

/** The notes list (`notes.list`), paged by core's cursor. */
export function noteListQuery(input: NoteListInput) {
  return trpc.notes.list.infiniteQueryOptions(input, {
    getNextPageParam: (page) => page.nextCursor,
  });
}

/** The tasks made from a note (`linkedNoteId`): its Tasks section and its "3 tasks" pill. */
export function noteTasksQuery(id: NoteId) {
  return trpc.tasks.list.infiniteQueryOptions(
    { filter: { noteId: id }, sort: { sortBy: 'createdAt', direction: 'asc' }, limit: 100 },
    { getNextPageParam: (page) => page.nextCursor },
  );
}

/** "2 tasks · 1 in progress": the tasks made from a note, for its pill and its task note card. */
export function tasksSummary(statuses: readonly TaskStatus[]): string | undefined {
  if (statuses.length === 0) return undefined;
  const started = statuses.filter((status) => status === TaskStatus.IN_PROGRESS).length;
  const count = `${statuses.length} ${statuses.length === 1 ? 'task' : 'tasks'}`;
  return started > 0 ? `${count} · ${started} in progress` : count;
}
