import { PageContent, PageToolbar } from '@renderer/components';
import { useSheet } from '@renderer/shared/hooks/use-sheet';
import { TasksBoard } from './board/TasksBoard';
import { TasksGroups } from './group/TasksGroups';
import { TasksList } from './list/TasksList';
import { CLEAR_FILTERS } from '../../api/search';
import { TasksToolbarEnd, TasksToolbarStart } from './TasksToolbar';
import { useTasksSearch } from '../../hooks/use-tasks-search';

export interface TasksViewProps {
  /**
   * Whether rows and cards show their project pill: on the tasks page (the default), whatever its
   * filter; not on a project's Tasks tab, where every task is that project's.
   */
  showProjectPill?: boolean;
}

/**
 * The tasks views as a page draws them: the toolbar (Status, the filters, Display) over the
 * list, the group view or the board, and the board's task sheet, each reading its state from the
 * `TasksSearchProvider` around it. The tasks page, and a project's Tasks tab with its project
 * fixed (`showProjectPill={false}`).
 */
export function TasksView({ showProjectPill = true }: TasksViewProps) {
  const { search, resolved, setSearch } = useTasksSearch();
  // a card opens in the sheet beside the board; the list and the group view have none
  const sheet = useSheet({ enabled: resolved.view === 'board' });
  return (
    <>
      <PageToolbar
        start={<TasksToolbarStart resolved={resolved} setSearch={setSearch} />}
        end={<TasksToolbarEnd resolved={resolved} setSearch={setSearch} />}
      />
      <PageContent layout="list" data-testid="page" data-view={resolved.view}>
        {resolved.view === 'board' ? (
          <TasksBoard resolved={resolved} onOpen={sheet.show} showProjectPill={showProjectPill} />
        ) : resolved.view === 'group' ? (
          <TasksGroups
            resolved={resolved}
            search={search}
            onClearFilters={() => setSearch(CLEAR_FILTERS)}
            showProjectPill={showProjectPill}
          />
        ) : (
          <TasksList
            resolved={resolved}
            search={search}
            onClearFilters={() => setSearch(CLEAR_FILTERS)}
            showProjectPill={showProjectPill}
          />
        )}
      </PageContent>
      {sheet.render()}
    </>
  );
}
