import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormat } from '../../../../components';
import { taskListQuery, withoutProjectPill } from '../../queries';
import {
  hasFilters,
  taskListInput,
  type ResolvedTasksSearch,
  type TasksSearch,
} from '../../search';
import { TaskListFrame } from '../TaskListFrame';
import { TasksEmptyState, TasksErrorState, TasksLoading } from '../TasksStates';

export interface TasksListProps {
  resolved: ResolvedTasksSearch;
  search: TasksSearch;
  onClearFilters: () => void;
}

/**
 * The list view (Figma `7155:5231`): one virtualized `TaskList` over `tasks.list`'s pages, loading
 * the next as the end comes near. Subtasks are rows of their own, with their parent's pill.
 */
export function TasksList({ resolved, search, onClearFilters }: TasksListProps) {
  const { now } = useFormat();
  const query = useInfiniteQuery(taskListQuery(taskListInput(resolved, now)));
  const tasks = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (query.isPending) return <TasksLoading />;
  if (query.isError) return <TasksErrorState onRetry={() => void query.refetch()} />;
  if (tasks.length === 0)
    return <TasksEmptyState filtered={hasFilters(search)} onClearFilters={onClearFilters} />;
  return (
    <TaskListFrame
      loaded={tasks}
      tasks={withoutProjectPill(tasks, resolved.project)}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
    />
  );
}
