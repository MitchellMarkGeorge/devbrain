import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ProjectListItem, ProjectSummary } from '@common/types';
import { resolveColor, type PickerProject } from '@renderer/components';
import { trpc } from '@renderer/ipc';

/**
 * Every open project (all but completed ones), as a picker offers them: the whole list, so the
 * menu's own filter finds any of them as the user types. Most workspaces fit in one page; the
 * rest follow until every page is loaded.
 */
const openProjectsQuery = () =>
  trpc.projects.list.infiniteQueryOptions(
    { filter: { excludeCompleted: true }, limit: 200 },
    { getNextPageParam: (page) => page.nextCursor },
  );

/** Every open project, as `projects.list` returns them, loading page after page. */
export function useOpenProjects(): ProjectListItem[] {
  const query = useInfiniteQuery(openProjectsQuery());
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data]);
}

/** A project as a picker's row: its id, name and folder colour. */
export function toPickerProject(project: ProjectSummary): PickerProject {
  return {
    id: project.id,
    name: project.title,
    color: resolveColor(project.color, 'blue') ?? 'blue',
  };
}

/** The projects a picker offers: every open project, each with its folder colour. */
export function useProjectOptions(): PickerProject[] {
  return useOpenProjects().map(toPickerProject);
}
