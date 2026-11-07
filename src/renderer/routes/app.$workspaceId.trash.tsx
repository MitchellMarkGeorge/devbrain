import { createFileRoute } from '@tanstack/react-router';
import { TrashPage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/trash')({
  staticData: { title: 'Trash' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.trash()),
  component: TrashPage,
});
