import { useMemo } from 'react';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import type { Note } from '@common/types';
import { toast } from '@renderer/components';
import { ipc } from '@renderer/ipc';
import { useMutationErrorToast } from '@renderer/shared/lib/mutation-errors';
import { useMoveToTrash } from '@renderer/shared/hooks/use-move-to-trash';

/** What an action needs of a note: core's row, or any read that has these. */
export interface NoteRef {
  id: NoteId;
  title: string;
  favoritedAt?: Date | null;
}

/** What a note links to: an event or a task, never both; null for neither. */
export type NoteLink = { linkedEventId: EventId } | { linkedTaskId: TaskId } | null;

/**
 * What the notes pages do to notes, on one note or a selection. Core has no bulk routes for
 * notes, so a selection's change runs one note at a time, in order, and stops at the first that
 * fails; the error toast says how many were changed before it. The calls' `changed` refetches
 * every read that shows the notes, so none of them is optimistic.
 */
export interface NoteActions {
  rename(note: NoteRef, title: string): void;
  setFavorite(notes: readonly NoteRef[], favorite: boolean): void;
  /** favorites them all, or unfavorites them all when every one is a favorite already */
  toggleFavorite(notes: readonly NoteRef[]): void;
  setProject(notes: readonly NoteRef[], projectId: ProjectId | null): void;
  /** links it to an event or a task (the other link removed), or to nothing */
  setLink(note: NoteRef, link: NoteLink): void;
  /**
   * copies it and its content ("Copy of …", in the same project, linked to nothing); resolves
   * with the copy, or null when it failed (the error toast said so)
   */
  duplicate(note: NoteRef): Promise<Note | null>;
  /** puts its title and content on the clipboard as Markdown, with a "Copied" toast */
  copyAsMarkdown(note: NoteRef): void;
  /** shows its markdown file in the file manager */
  showInFolder(note: NoteRef): void;
  /** to the trash, asking first when the setting says so, with the Undo toast */
  trash(notes: readonly NoteRef[]): Promise<boolean>;
}

const noun = (notes: readonly NoteRef[]) =>
  notes.length === 1 ? 'the note' : `${notes.length} notes`;

export function useNoteActions(): NoteActions {
  const showError = useMutationErrorToast();
  const moveToTrash = useMoveToTrash();
  return useMemo(() => {
    const run = (call: Promise<unknown>, action: string) =>
      void call.catch((error: unknown) => showError(error, action));
    // one call per note, in order; a failure stops the rest and says how far it got
    const each = (
      notes: readonly NoteRef[],
      action: string,
      call: (note: NoteRef) => Promise<unknown>,
    ) =>
      void (async () => {
        for (const [index, note] of notes.entries()) {
          try {
            await call(note);
          } catch (error) {
            const done = index > 0 ? ` (${index} of ${notes.length} were changed)` : '';
            showError(error, `${action}${done}`);
            return;
          }
        }
      })();
    const setFavorite = (notes: readonly NoteRef[], favorite: boolean) =>
      each(notes, `Couldn’t ${favorite ? 'favorite' : 'unfavorite'} ${noun(notes)}`, (note) =>
        ipc.notes.setFavorite.mutate({ id: note.id, favorite }),
      );
    return {
      rename: (note, title) =>
        run(ipc.notes.update.mutate({ id: note.id, title }), 'Couldn’t rename the note'),
      setFavorite,
      toggleFavorite: (notes) => setFavorite(notes, !notes.every((note) => note.favoritedAt)),
      setProject: (notes, projectId) =>
        each(notes, `Couldn’t move ${noun(notes)}`, (note) =>
          ipc.notes.update.mutate({ id: note.id, projectId }),
        ),
      setLink: (note, link) =>
        run(
          ipc.notes.update.mutate({
            id: note.id,
            linkedEventId: link && 'linkedEventId' in link ? link.linkedEventId : null,
            linkedTaskId: link && 'linkedTaskId' in link ? link.linkedTaskId : null,
          }),
          link ? 'Couldn’t link the note' : 'Couldn’t remove the link',
        ),
      duplicate: (note) =>
        ipc.notes.duplicate.mutate({ id: note.id }).catch((error: unknown) => {
          showError(error, 'Couldn’t duplicate the note');
          return null;
        }),
      copyAsMarkdown: (note) =>
        run(
          ipc.notes.toMarkdown
            .query({ id: note.id })
            .then((markdown) => navigator.clipboard.writeText(markdown))
            .then(() => toast({ tone: 'success', title: 'Copied' })),
          'Couldn’t copy the note',
        ),
      showInFolder: (note) =>
        run(ipc.notes.showInFolder.mutate({ id: note.id }), 'Couldn’t show the note’s file'),
      trash: (notes) =>
        moveToTrash(notes.map((note) => ({ id: note.id, title: note.title || 'Untitled' }))),
    };
  }, [showError, moveToTrash]);
}
