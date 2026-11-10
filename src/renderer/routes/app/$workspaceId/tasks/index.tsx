import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '../../../../pages/tasks/views/TasksPage';
import { loadTasks, tasksLoaderDeps } from '../../../../pages/tasks/loaders';
import { tasksSearchSchema } from '../../../../pages/tasks/search';

// The tasks: list, group or board, with filters and sort in the URL (?view=board&sort=due_date),
// and the board's task sheet at ?open=tsk_….
export const Route = createFileRoute('/app/$workspaceId/tasks/')({
  staticData: { title: 'Tasks' },
  validateSearch: tasksSearchSchema,
  loaderDeps: tasksLoaderDeps,
  loader: ({ context, deps }) => loadTasks(context, deps),
  component: TasksPage,
});
