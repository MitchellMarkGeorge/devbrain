import { createFileRoute } from '@tanstack/react-router';
import { TaskPage } from '@renderer/features/tasks/components/detail/TaskPage';
import { loadTask, parseTaskParams } from '@renderer/features/tasks/api/loaders';
import { taskPageSearchSchema } from '@renderer/features/tasks/api/search';

// A task's page; a missing or deleted task is its not-found. Its task note opens in the sheet at
// ?note=nte_….
export const Route = createFileRoute('/app/$workspaceId/tasks/$taskId')({
  staticData: { title: 'Tasks' },
  params: parseTaskParams,
  validateSearch: taskPageSearchSchema,
  loader: ({ context, params }) => loadTask(context, params.taskId),
  component: TaskPage,
});
