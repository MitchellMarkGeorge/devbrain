import type { TaskId } from '@common/ids';
import { Breadcrumb, PageContent, PageToolbar } from '../../components';
import { PageHeaderSlot } from '../app/page-header';
import { TasksBoard } from './TasksBoard';
import { TasksGroups } from './TasksGroups';
import { TasksList } from './TasksList';
import { TaskSheet } from './TaskSheet';
import { CLEAR_FILTERS } from './search';
import { TasksToolbarEnd, TasksToolbarStart, VIEW_ICONS, VIEW_LABELS } from './TasksToolbar';
import { useTasksSearch } from './use-tasks-search';
import { tasksRoute } from './route-api';

/**
 * The tasks page (`/app/$workspaceId/tasks`, Figma `7155:5231`, `7158:9538`, `7158:14338`): the
 * toolbar (Filter, Sort, the view, New Task) over the list, the group view or the board, each
 * reading its state from the URL.
 */
export function TasksPage() {
  const { search, resolved, setSearch } = useTasksSearch();
  const navigate = tasksRoute.useNavigate();
  // a card opens the sheet with an entry of its own, marked so the sheet's close goes back to it
  const openSheet = (open: TaskId) =>
    void navigate({
      search: (previous) => ({ ...previous, open }),
      state: (previous) => ({ ...previous, openedSheet: true }),
    });
  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              'Tasks',
              { label: VIEW_LABELS[resolved.view], icon: VIEW_ICONS[resolved.view] },
            ]}
          />
        }
      />
      <PageToolbar
        start={<TasksToolbarStart resolved={resolved} setSearch={setSearch} />}
        end={<TasksToolbarEnd resolved={resolved} setSearch={setSearch} />}
      />
      <PageContent layout="list" data-testid="page" data-view={resolved.view}>
        {resolved.view === 'board' ? (
          <TasksBoard resolved={resolved} onOpen={openSheet} />
        ) : resolved.view === 'group' ? (
          <TasksGroups
            resolved={resolved}
            search={search}
            onClearFilters={() => setSearch(CLEAR_FILTERS)}
          />
        ) : (
          <TasksList
            resolved={resolved}
            search={search}
            onClearFilters={() => setSearch(CLEAR_FILTERS)}
          />
        )}
      </PageContent>
      {resolved.view === 'board' && resolved.open && (
        <TaskSheet taskId={resolved.open} onClose={() => setSearch({ open: undefined })} />
      )}
    </>
  );
}
