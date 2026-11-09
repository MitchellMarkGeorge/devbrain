import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, ListFilter, Plus } from 'lucide-react';
import type { TaskListItem } from '@common/types';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  EmptyState,
  Stack,
  TaskList,
  TaskRowSkeleton,
  useFormat,
  type TaskListHandle,
} from '../../components';
import { KeyScope, useListCommands } from '../../keyboard';
import { useOpenEntity } from '../app/use-open-entity';
import { taskListQuery } from './queries';
import { hasFilters, taskListInput, type ResolvedTasksSearch, type TasksSearch } from './search';
import { TaskMenuItems } from './TaskMenus';
import { useTaskActions } from './use-task-actions';
import { useCreateTask } from './use-create-task';

export interface TasksListProps {
  resolved: ResolvedTasksSearch;
  search: TasksSearch;
  onClearFilters: () => void;
}

/**
 * The list view (Figma `7155:5231`): one virtualized `TaskList` over `tasks.list`'s pages, loading
 * the next as the end comes near. Status, priority and favorite change at once (optimistic); the
 * list keys run through the keyboard layer; a right-click opens the row's menu.
 */
export function TasksList({ resolved, search, onClearFilters }: TasksListProps) {
  const { now } = useFormat();
  const query = useInfiniteQuery(taskListQuery(taskListInput(resolved, now)));
  const tasks = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const list = useRef<TaskListHandle>(null);
  const actions = useTaskActions();
  const openEntity = useOpenEntity();
  const createTask = useCreateTask();
  // the task whose row was right-clicked: the menu is drawn for it
  const [menuTask, setMenuTask] = useState<TaskListItem | null>(null);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id as string, task])), [tasks]);
  const full = (rows: readonly { id: string }[]) => rows.flatMap((row) => byId.get(row.id) ?? []);

  useListCommands(list, {
    open: (task) => openEntity({ id: task.id }),
    setStatus: (rows, status) => actions.setStatus(full(rows), status),
    toggleFavorite: (rows) => actions.toggleFavorite(full(rows)),
    trash: (rows) => void actions.trash(full(rows)),
  });

  if (query.isPending) {
    return (
      <Stack gap="0" aria-busy data-testid="tasks-loading">
        {Array.from({ length: 8 }, (_, i) => (
          <TaskRowSkeleton key={i} />
        ))}
      </Stack>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        icon={CircleX}
        title="Tasks couldn’t be loaded"
        description="Something went wrong reading this workspace’s tasks."
        action={
          <Button size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (tasks.length === 0) {
    return hasFilters(search) ? (
      <EmptyState
        icon={ListFilter}
        title="No tasks match these filters"
        description="Try another filter, or clear them to see every task."
        action={
          <Button size="sm" onClick={onClearFilters}>
            Clear Filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={CircleCheck}
        title="No tasks yet"
        description="Tasks you create, and tasks synced from Linear, show up here."
        action={
          <Button size="sm" icon={Plus} onClick={() => createTask()}>
            New Task
          </Button>
        }
      />
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        style={{ display: 'contents' }}
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>('[data-task-id]');
          const task = row ? (byId.get(row.dataset.taskId ?? '') ?? null) : null;
          setMenuTask(task);
          if (!task) event.preventDefault();
        }}
      >
        <KeyScope name="list">
          <TaskList
            ref={list}
            tasks={tasks}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            onStatusChange={(task, status) => actions.setStatus(full([task]), status)}
            onOpen={(task) => openEntity({ id: task.id })}
          />
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
