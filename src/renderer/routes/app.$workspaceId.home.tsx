import { createFileRoute } from '@tanstack/react-router';
import { HomePage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/home')({
  staticData: { title: 'Home' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.home()),
  component: HomePage,
});
