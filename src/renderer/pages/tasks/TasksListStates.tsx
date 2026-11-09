import { CircleCheck, CircleX, ListFilter, Plus } from 'lucide-react';
import { Button, EmptyState, Stack, TaskRowSkeleton } from '../../components';
import { hasFilters, type TasksSearch } from './search';
import { useCreateTask } from './use-create-task';

// The tasks page's states (Figma `7175:35659`, `7175:36459`, `7426:44078`): loading, empty, no
// results for the filters, and an error with Retry.

export function TasksLoading() {
  return (
    <Stack gap="0" aria-busy data-testid="tasks-loading">
      {Array.from({ length: 8 }, (_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </Stack>
  );
}

export function TasksError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={CircleX}
      title="Tasks couldn’t be loaded"
      description="Something went wrong reading this workspace’s tasks."
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/** No tasks: none yet (New Task), or none for these filters (Clear Filters). */
export function TasksEmpty({
  search,
  onClearFilters,
}: {
  search: TasksSearch;
  onClearFilters: () => void;
}) {
  const createTask = useCreateTask();
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
