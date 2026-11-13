import { useState } from 'react';
import type { TaskId } from '@common/ids';
import { PageContent, PageToolbar } from '../../../components';
import { TasksBoard } from './board/TasksBoard';
import { TasksGroups } from './group/TasksGroups';
import { TasksList } from './list/TasksList';
import { TaskSheet } from '../sheet/TaskSheet';
import { CLEAR_FILTERS, SORTS, TASK_VIEWS } from '../search';
import { SORT_LABELS, TasksToolbarEnd, TasksToolbarStart, VIEW_LABELS } from './TasksToolbar';
import { useCommands } from '../../../keyboard';
import { useTasksSearch } from '../use-tasks-search';

/**
 * The tasks views as a page draws them: the toolbar (Filter, Sort, the view, New Task) over the
 * list, the group view or the board, and the board's task sheet, each reading its state from the
 * `TasksSearchProvider` around it. The tasks page, and a project's Tasks tab with its project
 * fixed.
 */
export function TasksView() {
  const { search, resolved, setSearch } = useTasksSearch();
  // a card opens the sheet with an entry of its own, marked so the sheet's close goes back to it
  const openSheet = (open: TaskId) => setSearch({ open }, { push: true, openedSheet: true });
  // the sheet's task stays mounted once `open` leaves the URL, until the sheet has slid out
  const [sheetTask, setSheetTask] = useState(resolved.open);
  if (resolved.open && resolved.open !== sheetTask) setSheetTask(resolved.open);
  // the toolbar's view and sort, as commands: Vim's `:board`, `:sort priority`
  useCommands([
    ...TASK_VIEWS.map((view) => ({
      id: `view.${view}`,
      title: `${VIEW_LABELS[view]} view`,
      scope: 'page' as const,
      run: () => setSearch({ view, open: undefined }),
    })),
    ...SORTS.map((sort) => ({
      id: `sort.${sort}`,
      title: `Sort by ${SORT_LABELS[sort].toLowerCase()}`,
      scope: 'page' as const,
      run: () => setSearch({ sort, dir: undefined }),
      // the board has no sort
      enabled: () => resolved.view !== 'board',
    })),
  ]);
  return (
    <>
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
