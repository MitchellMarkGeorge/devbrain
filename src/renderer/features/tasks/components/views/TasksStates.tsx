import { useContext, useEffect, useState } from 'react';
import { CircleCheck, CircleX, ListFilter, Plus } from 'lucide-react';
import { Button, EmptyState, Stack, TaskRowSkeleton } from '@renderer/components';
import { useCreateTask } from '../../hooks/use-create-task';
import { TasksSearchContextOrNull } from '../../hooks/use-tasks-search';

// The tasks views' states (Figma `7175:35659`, `7175:36459`, `7426:44078`): no tasks yet, none
// matching the filters, and a read that failed.

/** No tasks: "No tasks yet" with New Task, or with filters on, "No tasks match" with Clear Filters. */
export function TasksEmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  const createTask = useCreateTask();
  // a project's Tasks tab: New Task files the task there
  const project = useContext(TasksSearchContextOrNull)?.project;
  return filtered ? (
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
      title={project ? 'No tasks in this project yet' : 'No tasks yet'}
      description={
        project
          ? 'Tasks you add to this project show up here.'
          : 'Tasks you create, and tasks synced from Linear, show up here.'
      }
      action={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => createTask(project ? { defaults: { projectId: project } } : undefined)}
        >
          New Task
        </Button>
      }
    />
  );
}

/** The tasks couldn't be read: why, and Retry. */
export function TasksErrorState({ onRetry }: { onRetry: () => void }) {
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

// how long a load runs before its skeleton shows: a local read is usually done well within it,
// and a skeleton drawn for a frame or two only flickers
const SKELETON_DELAY_MS = 150;

/** The first page is loading: a few rows' skeleton, once the load has run for a moment. */
export function TasksLoading() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Stack gap="0" aria-busy data-testid="tasks-loading">
      {shown && Array.from({ length: 8 }, (_, i) => <TaskRowSkeleton key={i} />)}
    </Stack>
  );
}
