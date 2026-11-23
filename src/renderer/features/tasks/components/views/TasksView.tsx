import { useState } from 'react';
import type { TaskId } from '@common/ids';
import { PageContent, PageToolbar } from '@renderer/components';
import { TasksBoard } from './board/TasksBoard';
import { TasksGroups } from './group/TasksGroups';
import { TasksList } from './list/TasksList';
import { TaskSheet } from '../sheet/TaskSheet';
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
 * The tasks views as a page draws them: the toolbar (Filter, Sort, the view, New Task) over the
 * list, the group view or the board, and the board's task sheet, each reading its state from the
 * `TasksSearchProvider` around it. The tasks page, and a project's Tasks tab with its project
 * fixed (`showProjectPill={false}`).
 */
export function TasksView({ showProjectPill = true }: TasksViewProps) {
  const { search, resolved, setSearch } = useTasksSearch();
  // a card opens the sheet with an entry of its own, marked so the sheet's close goes back to it
  const openSheet = (open: TaskId) => setSearch({ open }, { push: true, openedSheet: true });
  // the sheet's task stays mounted once `open` leaves the URL, until the sheet has slid out
  const [sheetTask, setSheetTask] = useState(resolved.open);
  if (resolved.open && resolved.open !== sheetTask) setSheetTask(resolved.open);
  return (
    <>
      <PageToolbar
        start={<TasksToolbarStart resolved={resolved} setSearch={setSearch} />}
        end={<TasksToolbarEnd resolved={resolved} setSearch={setSearch} />}
      />
      <PageContent layout="list" data-testid="page" data-view={resolved.view}>
        {resolved.view === 'board' ? (
          <TasksBoard resolved={resolved} onOpen={openSheet} showProjectPill={showProjectPill} />
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
      {resolved.view === 'board' && sheetTask && (
        <TaskSheet
          taskId={sheetTask}
          open={resolved.open !== undefined}
          onClose={() => setSearch({ open: undefined })}
          onClosed={() => setSheetTask(undefined)}
        />
      )}
    </>
  );
}
