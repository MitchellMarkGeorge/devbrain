import { useMemo } from 'react';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { ipc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';
import { useMoveToTrash } from '../app/use-move-to-trash';

/** What an action needs of a note: core's row, or any read that has these. */
export interface NoteRef {
  id: NoteId;
  title: string;
  favoritedAt?: Date | null;
}

/** What a note links to: an event or a task, never both; null for neither. */
export type NoteLink = { linkedEventId: EventId } | { linkedTaskId: TaskId } | null;

/**
 * What the notes pages do to a note: each one call, its failure shown in the error toast. The
 * call's `changed` refetches every read that shows the note, so none of them is optimistic.
 */
export interface NoteActions {
  rename(note: NoteRef, title: string): void;
  setFavorite(note: NoteRef, favorite: boolean): void;
  toggleFavorite(note: NoteRef): void;
  setProject(note: NoteRef, projectId: ProjectId | null): void;
  /** links it to an event or a task (the other link removed), or to nothing */
  setLink(note: NoteRef, link: NoteLink): void;
  /** shows its markdown file in the file manager */
  showInFolder(note: NoteRef): void;
  /** to the trash, asking first when the setting says so, with the Undo toast */
  trash(note: NoteRef): Promise<boolean>;
}

export function useNoteActions(): NoteActions {
  const showError = useMutationErrorToast();
  const moveToTrash = useMoveToTrash();
  return useMemo(() => {
    const run = (call: Promise<unknown>, action: string) =>
      void call.catch((error: unknown) => showError(error, action));
    const setFavorite = (note: NoteRef, favorite: boolean) =>
      run(
        ipc.notes.setFavorite.mutate({ id: note.id, favorite }),
        `Couldn’t ${favorite ? 'favorite' : 'unfavorite'} the note`,
      );
    return {
      rename: (note, title) =>
        run(ipc.notes.update.mutate({ id: note.id, title }), 'Couldn’t rename the note'),
      setFavorite,
      toggleFavorite: (note) => setFavorite(note, !note.favoritedAt),
      setProject: (note, projectId) =>
        run(ipc.notes.update.mutate({ id: note.id, projectId }), 'Couldn’t change the project'),
      setLink: (note, link) =>
        run(
          ipc.notes.update.mutate({
            id: note.id,
            linkedEventId: link && 'linkedEventId' in link ? link.linkedEventId : null,
            linkedTaskId: link && 'linkedTaskId' in link ? link.linkedTaskId : null,
          }),
          link ? 'Couldn’t link the note' : 'Couldn’t remove the link',
        ),
      showInFolder: (note) =>
        run(ipc.notes.showInFolder.mutate({ id: note.id }), 'Couldn’t show the note’s file'),
      trash: (note) => moveToTrash([{ id: note.id, title: note.title || 'Untitled' }]),
    };
  }, [showError, moveToTrash]);
}
