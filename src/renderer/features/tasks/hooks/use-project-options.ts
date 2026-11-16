import { useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
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

/** The projects a picker offers: every open project, each with its folder colour. */
export function useProjectOptions(): PickerProject[] {
  const query = useInfiniteQuery(openProjectsQuery());
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return (query.data?.pages ?? []).flatMap((page) =>
    page.items.map((project) => ({
      id: project.id,
      name: project.title,
      color: resolveColor(project.color, 'blue') ?? 'blue',
    })),
  );
}
