import { createFileRoute } from '@tanstack/react-router';
import { NotesPage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/notes')({
  staticData: { title: 'Notes' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.notes()),
  component: NotesPage,
});
