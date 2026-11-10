import { useEffect, useState } from 'react';
import { CircleX, Folder, ListFilter, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, Stack } from '../../../components';
import { useCreateProject } from '../create/use-create-project';

// The projects page's states: no projects yet, none matching the filter, and a read that failed.

/** No projects: "No projects yet" with New Project, or with a filter on, Clear Filters. */
export function ProjectsEmptyState({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  const createProject = useCreateProject();
  return filtered ? (
    <EmptyState
      icon={ListFilter}
      title="No projects match this filter"
      description="Try another filter, or clear it to see the active projects."
      action={
        <Button size="sm" onClick={onClearFilters}>
          Clear Filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Folder}
      title="No active projects"
      description="Projects group your tasks and notes. Projects synced from Linear show up here too."
      action={
        <Button size="sm" icon={Plus} onClick={() => createProject()}>
          New Project
        </Button>
      }
    />
  );
}

/** The projects couldn't be read: why, and Retry. */
export function ProjectsErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={CircleX}
      title="Projects couldn’t be loaded"
      description="Something went wrong reading this workspace’s projects."
      action={
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

// how long a load runs before its skeleton shows: a local read is usually done well within it
const SKELETON_DELAY_MS = 150;

/** The first page is loading: a few rows' skeleton, once the load has run for a moment. */
export function ProjectsLoading() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Stack gap="2" aria-busy data-testid="projects-loading">
      {shown && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} style={{ height: 32 }} />)}
    </Stack>
  );
}
