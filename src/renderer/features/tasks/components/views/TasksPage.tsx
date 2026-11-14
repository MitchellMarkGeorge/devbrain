import { Breadcrumb } from '@renderer/components';
import { PageHeaderSlot } from '@renderer/layouts/workspace/page-header';
import { VIEW_ICONS, VIEW_LABELS } from './TasksToolbar';
import { TasksSearchProvider, useTasksRouteSearch } from '../../hooks/use-tasks-search';
import { TasksView } from './TasksView';

/**
 * The tasks page (`/app/$workspaceId/tasks`, Figma `7155:5231`, `7158:9538`, `7158:14338`): the
 * toolbar (Filter, Sort, the view, New Task) over the list, the group view or the board, each
 * reading its state from the URL.
 */
export function TasksPage() {
  const state = useTasksRouteSearch();
  const { view } = state.resolved;
  return (
    <TasksSearchProvider value={state}>
      <PageHeaderSlot
        place={
          <Breadcrumb items={['Tasks', { label: VIEW_LABELS[view], icon: VIEW_ICONS[view] }]} />
        }
      />
      <TasksView />
    </TasksSearchProvider>
  );
}
