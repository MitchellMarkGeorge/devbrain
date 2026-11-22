import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormat } from '@renderer/components';
import { taskTreeQuery } from '../../../api/queries';
import {
  hasFilters,
  taskListInput,
  type ResolvedTasksSearch,
  type TasksSearch,
} from '../../../api/search';
import { TaskListFrame } from '../TaskListFrame';
import { TasksEmptyState, TasksErrorState, TasksLoading } from '../TasksStates';

export interface TasksListProps {
  resolved: ResolvedTasksSearch;
  search: TasksSearch;
  onClearFilters: () => void;
  /** whether rows and cards show their project pill (see `TasksView`) */
  showProjectPill: boolean;
}

/**
 * The list view (Figma `7155:5231`): one virtualized `TaskList` over `tasks.tree`'s pages, loading
 * the next as the end comes near. Each subtask is under its parent; one whose parent the filter
 * leaves out is a row of its own, with its parent's pill.
 */
export function TasksList({ resolved, search, onClearFilters, showProjectPill }: TasksListProps) {
  const { now } = useFormat();
  const input = useMemo(() => taskListInput(resolved, now), [resolved, now]);
  const query = useInfiniteQuery(taskTreeQuery(input));
  const tasks = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (query.isPending) return <TasksLoading />;
  if (query.isError) return <TasksErrorState onRetry={() => query.refetch()} />;
  if (tasks.length === 0)
    return <TasksEmptyState filtered={hasFilters(search)} onClearFilters={onClearFilters} />;
  return (
    <TaskListFrame
      tasks={tasks}
      input={input}
      showProjectPill={showProjectPill}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      }}
    />
  );
}
