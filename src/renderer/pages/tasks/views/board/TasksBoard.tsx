import { useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskId } from '@common/ids';
import { TaskStatus, type TaskListItem } from '@common/types';
import {
  Board,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  useFormat,
} from '../../../../components';
import { KeyScope } from '../../../../keyboard';
import { useOpenEntity } from '../../../app/use-open-entity';
import {
  boardAnnouncements,
  boardCollisions,
  boardInstructions,
  DraggableCard,
  DragPreview,
  dragTask,
  DroppableColumn,
  placeCards,
  useBoardSensors,
} from './board-drag';
import { prefetchTaskSheet, taskListQuery } from '../../queries';
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
} from '../../search';
import { TaskMenuItems } from '../../menus/TaskMenus';
import { TasksEmptyState, TasksErrorState, TasksLoading } from '../TasksStates';
import { useCreateTask } from '../../create/use-create-task';
import { useTaskActions } from '../../use-task-actions';
import { useTasksSearch } from '../../use-tasks-search';
import styles from './TasksBoard.module.css';

export interface TasksBoardProps {
  resolved: ResolvedTasksSearch;
  /** shows a task in the sheet (`?open=tsk_…`) */
  onOpen: (id: TaskId) => void;
}

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
 * on a card opens it in the sheet; dragging a card to another column (`board-drag.tsx`, by pointer
 * or keyboard) sets its status, and the card moves at once, to the top of that column until the
 * columns refetch. A synced task's card can't be dragged, as its status is its provider's. A
 * right-click opens the task's menu.
 */
export function TasksBoard({ resolved, onOpen }: TasksBoardProps) {
  const { now } = useFormat();
  const { search, setSearch } = useTasksSearch();
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  const queryClient = useQueryClient();
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
  const placed = placeCards(columns);
  const byId = new Map<string, TaskListItem>();
  for (const column of placed) for (const task of column.tasks) byId.set(task.id, task);

  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const [dragging, setDragging] = useState<TaskListItem | null>(null);
  const sensors = useBoardSensors();

  if (columns.every((column) => column.query.isPending)) return <TasksLoading />;
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
        <DndContext
          sensors={sensors}
          collisionDetection={boardCollisions}
          accessibility={{
            announcements: boardAnnouncements,
            screenReaderInstructions: boardInstructions,
          }}
          onDragStart={({ active }) => setDragging(dragTask(active.data.current) ?? null)}
          onDragCancel={() => setDragging(null)}
          onDragEnd={({ active, over }) => {
            setDragging(null);
            const task = dragTask(active.data.current);
            const status = over?.id as TaskStatus | undefined;
            if (task && status && task.status !== status) actions.setStatus([task], status);
          }}
        >
          <KeyScope name="board" render={<Board />}>
            {placed.map(({ status, query, tasks }) => (
              <DroppableColumn
                key={status}
                status={status}
                tasks={tasks}
                className={styles.column}
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
                renderCard={(card, task) => (
                  <DraggableCard
                    {...card}
                    // the sheet's task and subtasks start loading before the click
                    onPointerEnter={() => prefetchTaskSheet(queryClient, task.id as TaskId)}
                    onFocus={() => prefetchTaskSheet(queryClient, task.id as TaskId)}
                  />
                )}
              />
            ))}
          </KeyScope>
          {/* the card under the pointer: drawn over everything, so a column's scroll can't clip it */}
          <DragOverlay dropAnimation={null}>
            {dragging && <DragPreview task={dragging} />}
          </DragOverlay>
        </DndContext>
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
