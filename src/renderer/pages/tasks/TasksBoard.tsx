import { useState, type DragEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import { TaskStatus, type TaskListItem } from '@common/types';
import {
  Board,
  BoardColumn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Stack,
  TaskRowSkeleton,
  useFormat,
} from '../../components';
import { KeyScope } from '../../keyboard';
import { useOpenEntity } from '../app/use-open-entity';
import { isSynced, taskListQuery } from './queries';
import {
  CLEAR_FILTERS,
  hasFilters,
  STATUS_OF,
  taskFilterOf,
  taskSortOf,
  TASKS_PAGE_SIZE,
  type ResolvedTasksSearch,
  type TaskFilter,
  type TaskSort,
} from './search';
import { TaskMenuItems } from './TaskMenus';
import { TasksEmptyState, TasksErrorState } from './TasksStates';
import { useCreateTask } from './use-create-task';
import { useTaskActions } from './use-task-actions';
import { useTasksSearch } from './use-tasks-search';
import styles from './TasksBoard.module.css';

export interface TasksBoardProps {
  resolved: ResolvedTasksSearch;
  /** shows a task in the sheet (`?open=tsk_…`) */
  onOpen: (id: TaskId) => void;
}

// what a dragged card carries: its task's id
const DRAG_TYPE = 'application/x-devbrain-task';

/**
 * The columns the status filter shows: open tasks in Not started and In progress, all of them
 * with Completed too, and one status in a column of its own. Cancelled shows only when filtered to.
 */
export function boardStatuses(status: ResolvedTasksSearch['status']): TaskStatus[] {
  if (status === 'open') return [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS];
  if (status === 'all') {
    return [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED];
  }
  return [STATUS_OF[status]];
}

// one column's tasks: its own infinite query, idle while the column isn't shown
function useColumn(status: TaskStatus, base: TaskFilter, sort: TaskSort, shown: TaskStatus[]) {
  const query = useInfiniteQuery({
    ...taskListQuery({ filter: { ...base, status }, sort, limit: TASKS_PAGE_SIZE }),
    enabled: shown.includes(status),
  });
  const tasks = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { status, query, tasks };
}

/**
 * The board view (Figma `7158:14338`): a virtualized `BoardColumn` per status, each its own
 * `tasks.list` infinite query with the page's other filters, loading more as it scrolls. A click
 * on a card opens it in the sheet; dragging a card to another column sets its status (optimistic:
 * it changes in place, then moves once the columns refetch). A synced task's card can't be
 * dragged, as its status is its provider's. A right-click opens the task's menu.
 */
export function TasksBoard({ resolved, onOpen }: TasksBoardProps) {
  const { now } = useFormat();
  const { search, setSearch } = useTasksSearch();
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  const shown = boardStatuses(resolved.status);
  // the page's filters other than status (each column adds its own); an overdue filter keeps its
  // "open only"
  const base = taskFilterOf({ ...resolved, status: 'all' }, now);
  const sort = taskSortOf(resolved);

  // the four, always called in the same order (hooks can't vary in number)
  const all = [
    useColumn(TaskStatus.NOT_STARTED, base, sort, shown),
    useColumn(TaskStatus.IN_PROGRESS, base, sort, shown),
    useColumn(TaskStatus.COMPLETED, base, sort, shown),
    useColumn(TaskStatus.CANCELLED, base, sort, shown),
  ];
  const columns = all.filter((column) => shown.includes(column.status));
  const byId = new Map<string, TaskListItem>();
  for (const column of columns) for (const task of column.tasks) byId.set(task.id, task);

  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  if (columns.every((column) => column.query.isPending)) {
    return (
      <Stack gap="0" aria-busy data-testid="tasks-loading">
        {Array.from({ length: 6 }, (_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </Stack>
    );
  }
  if (columns.some((column) => column.query.isError)) {
    return (
      <TasksErrorState onRetry={() => columns.forEach((column) => void column.query.refetch())} />
    );
  }
  if (columns.every((column) => !column.query.isPending && column.tasks.length === 0)) {
    return (
      <TasksEmptyState
        filtered={hasFilters(search)}
        onClearFilters={() => setSearch(CLEAR_FILTERS)}
      />
    );
  }

  const projectId = resolved.project && resolved.project !== 'none' ? resolved.project : undefined;
  const carries = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE);

  // a column takes a dragged card: the drop sets the card's task to the column's status
  function dropProps(status: TaskStatus) {
    return {
      className: styles.column,
      'data-drop-target': dropTarget === status ? '' : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!carries(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (dropTarget !== status) setDropTarget(status);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setDropTarget(null);
        const task = byId.get(event.dataTransfer.getData(DRAG_TYPE));
        if (!task) return;
        event.preventDefault();
        if (task.status !== status) actions.setStatus([task], status);
      },
    };
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={styles.trigger}
        onContextMenu={(event) => {
          const card = (event.target as Element).closest<HTMLElement>('[data-task-id]');
          const task = card ? (byId.get(card.dataset.taskId ?? '') ?? null) : null;
          setMenuTask(task);
          if (!task) event.preventDefault();
        }}
      >
        <KeyScope name="board" render={<Board />}>
          {columns.map(({ status, query, tasks }) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={tasks}
              add={status !== TaskStatus.COMPLETED && status !== TaskStatus.CANCELLED}
              onAdd={() => createTask({ defaults: { status, projectId } })}
              onOpen={(task) => onOpen(task.id as TaskId)}
              onDueDateChange={(task, date) => {
                const full = byId.get(task.id);
                if (full) actions.setDueDate([full], date);
              }}
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
              }}
              cardProps={(task) => {
                const full = byId.get(task.id);
                const draggable = full !== undefined && !isSynced(full);
                return {
                  draggable,
                  onDragStart: draggable
                    ? (event: DragEvent<HTMLDivElement>) => {
                        event.dataTransfer.setData(DRAG_TYPE, task.id);
                        event.dataTransfer.effectAllowed = 'move';
                      }
                    : undefined,
                  onDragEnd: () => setDropTarget(null),
                };
              }}
              {...dropProps(status)}
            />
          ))}
        </KeyScope>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menuTask && (
          <TaskMenuItems
            task={byId.get(menuTask.id) ?? menuTask}
            actions={actions}
            onOpen={() => openEntity({ id: menuTask.id })}
          />
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
