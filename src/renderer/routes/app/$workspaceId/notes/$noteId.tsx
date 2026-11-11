import { createFileRoute } from '@tanstack/react-router';
import { NotePage } from '../../../../pages/notes/detail/NotePage';
import { loadNote, parseNoteParams } from '../../../../pages/notes/loaders';
import { notePageSearchSchema } from '../../../../pages/notes/search';

// A note's page; a missing or deleted note is its not-found. A task made from it opens in the
// sheet at ?open=tsk_….
export const Route = createFileRoute('/app/$workspaceId/notes/$noteId')({
  staticData: { title: 'Notes' },
  params: parseNoteParams,
  validateSearch: notePageSearchSchema,
  loader: ({ context, params }) => loadNote(context, params.noteId),
  component: NotePage,
});
