import { notFound } from '@tanstack/react-router';
import { isId, type NoteId } from '@common/ids';
import type { RouterContext } from '../../router';
import { ipcErrorCode } from '../../workspace/errors';
import { noteListQuery, noteTasksQuery } from './queries';
import { noteListInput, resolveNotesSearch, type NotesSearch } from './search';

// What the notes routes load before their first frame (routes/app/$workspaceId/notes/): they only
// prime React Query's cache, which the pages read.

/** The list page: the first page of notes, for the view's filters and sort. */
export async function loadNotes({ queryClient }: RouterContext, search: NotesSearch) {
  await queryClient.infiniteQuery({
    ...noteListQuery(noteListInput(resolveNotesSearch(search))),
    staleTime: 'static',
  });
}

/** The note page's id, checked: anything but a note id is no page. */
export const parseNoteParams = {
  parse: ({ noteId }: { noteId: string }): { noteId: NoteId } => {
    if (!isId('note', noteId)) throw notFound();
    return { noteId };
  },
  stringify: ({ noteId }: { noteId: NoteId }) => ({ noteId }),
};

/**
 * The note page: the note and its markdown (a missing note is the route's not-found), so the
 * editor draws with its text on the first frame; its tasks after.
 */
export async function loadNote({ queryClient, trpc }: RouterContext, id: NoteId) {
  try {
    await Promise.all([
      queryClient.query({ ...trpc.notes.get.queryOptions({ id }), staleTime: 'static' }),
      queryClient.query({ ...trpc.notes.readContent.queryOptions({ id }), staleTime: 'static' }),
    ]);
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
  void queryClient.infiniteQuery({ ...noteTasksQuery(id), staleTime: 'static' }).catch(() => {});
}
