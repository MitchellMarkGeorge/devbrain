import { createFileRoute } from '@tanstack/react-router';
import { NotePage } from '../../../../pages/notes/detail/NotePage';
import { loadNote, parseNoteParams } from '../../../../pages/notes/loaders';

// A note's page; a missing or deleted note is its not-found.
export const Route = createFileRoute('/app/$workspaceId/notes/$noteId')({
  staticData: { title: 'Notes' },
  params: parseNoteParams,
  loader: ({ context, params }) => loadNote(context, params.noteId),
  component: NotePage,
});
