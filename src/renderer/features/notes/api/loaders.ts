import { noop } from '@tanstack/react-query';
import { notFound } from '@tanstack/react-router';
import { isId, type NoteId } from '@common/ids';
import type { RouterContext } from '@renderer/app/router';
import { primeLinks, primeMentions } from '@renderer/shared/api/loaders';
import { ipcErrorCode } from '@renderer/shared/lib/workspace/errors';
import { noteContentQuery, noteListQuery, noteTasksQuery } from './queries';
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
 * The note page, whole on its first frame: the note and its markdown (a missing note is the
 * route's not-found), the task or event it links to, the tasks made from it and what mentions it
 * (the pills under the title). The tasks and mentions are read alongside the note, as they don't
 * depend on it; a failed read of them or of the link doesn't fail the page, which then loads them
 * itself.
 */
export async function loadNote(context: RouterContext, id: NoteId) {
  const { queryClient, trpc } = context;
  const tasks = queryClient
    .infiniteQuery({ ...noteTasksQuery(id), staleTime: 'static' })
    .catch(noop);
  const mentions = primeMentions(context, id);
  let note;
  try {
    [note] = await Promise.all([
      queryClient.query({ ...trpc.notes.get.queryOptions({ id }), staleTime: 'static' }),
      queryClient.query({ ...noteContentQuery(id), staleTime: 'static' }),
    ]);
  } catch (error) {
    if (ipcErrorCode(error) === 'not_found') throw notFound();
    throw error;
  }
  await Promise.all([tasks, mentions, primeLinks(context, note)]);
}
