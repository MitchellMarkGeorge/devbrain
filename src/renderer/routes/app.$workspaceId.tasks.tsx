import { createFileRoute } from '@tanstack/react-router';
import { TasksPage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/tasks')({
  staticData: { title: 'Tasks' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.tasks()),
  component: TasksPage,
});
