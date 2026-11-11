import type { EventId, NoteId, TaskId } from '@common/ids';
import type { RouterContext } from '../../router';

/** What an entity links to, as core's row names it: a task's event or note, a note's event or task. */
export interface Links {
  linkedEventId?: EventId | null;
  linkedNoteId?: NoteId | null;
  linkedTaskId?: TaskId | null;
}

/**
 * Primes what a page's link pill reads (`events.get`, `notes.get`, `tasks.get`), so a task or note
 * page draws with the pill in place on its first frame rather than adding it a moment later. A
 * read that fails doesn't fail the page: the pill loads on its own then, as it would without this.
 */
export async function primeLinks({ queryClient, trpc }: RouterContext, links: Links) {
  const reads: Promise<unknown>[] = [];
  if (links.linkedEventId) {
    const options = trpc.events.get.queryOptions({ id: links.linkedEventId });
    reads.push(queryClient.query({ ...options, staleTime: 'static' }));
  }
  if (links.linkedNoteId) {
    const options = trpc.notes.get.queryOptions({ id: links.linkedNoteId });
    reads.push(queryClient.query({ ...options, staleTime: 'static' }));
  }
  if (links.linkedTaskId) {
    const options = trpc.tasks.get.queryOptions({ id: links.linkedTaskId });
    reads.push(queryClient.query({ ...options, staleTime: 'static' }));
  }
  await Promise.allSettled(reads);
}
