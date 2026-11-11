import { useCallback } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { ProjectId } from '@common/ids';
import { ipc } from '../../ipc';
import { useMutationErrorToast } from '../app/mutation-errors';

declare module '@tanstack/history' {
  interface HistoryState {
    /** the note was just created: its page focuses the empty title */
    newNote?: boolean;
  }
}

export interface CreateNoteOptions {
  /** in this project (the notes page filtered to it) */
  projectId?: ProjectId;
}

/**
 * Creates an empty note and opens its page with the title focused (Figma `7175:41157`): N
 * anywhere, the sidebar's compose button, the notes page's "+ New Note". Resolves once the page
 * is open; a failure shows the error toast.
 */
export function useCreateNote(): (options?: CreateNoteOptions) => Promise<void> {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const showError = useMutationErrorToast();
  return useCallback(
    async (options = {}) => {
      try {
        const note = await ipc.notes.create.mutate({ projectId: options.projectId });
        await navigate({
          to: '/app/$workspaceId/notes/$noteId',
          params: { workspaceId, noteId: note.id },
          state: (previous) => ({ ...previous, newNote: true }),
        });
      } catch (error) {
        showError(error, 'Couldn’t create a note');
      }
    },
    [workspaceId, navigate, showError],
  );
}
