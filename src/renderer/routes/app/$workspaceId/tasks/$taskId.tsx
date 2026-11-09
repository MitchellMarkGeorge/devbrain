import { createFileRoute } from '@tanstack/react-router';
import { TaskPage } from '../../../../pages/tasks/TaskPage';
import { loadTask, parseTaskParams } from '../../../../pages/tasks/loaders';

// A task's page; a missing or deleted task is its not-found.
export const Route = createFileRoute('/app/$workspaceId/tasks/$taskId')({
  staticData: { title: 'Tasks' },
  params: parseTaskParams,
  loader: ({ context, params }) => loadTask(context, params.taskId),
  component: TaskPage,
});
