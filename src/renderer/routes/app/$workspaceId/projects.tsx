import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage, pageQueries } from '../../../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/projects')({
  staticData: { title: 'Projects' },
  loader: ({ context: { queryClient } }) =>
    queryClient.query({ ...pageQueries.projects(), staleTime: 'static' }),
  component: ProjectsPage,
});
