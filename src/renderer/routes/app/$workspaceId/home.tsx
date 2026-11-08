import { createFileRoute } from '@tanstack/react-router';
import { HomePage, pageQueries } from '../../../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/home')({
  staticData: { title: 'Home' },
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...pageQueries.home(), staleTime: 'static' }),
  component: HomePage,
});
