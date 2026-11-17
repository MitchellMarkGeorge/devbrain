import { describe, expect, it } from 'vitest';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { taskListQuery, subtasksQuery } from '@renderer/features/tasks/api/queries';
import { noteListQuery, noteTasksQuery } from '@renderer/features/notes/api/queries';
import { projectListQuery, projectNotesQuery } from '@renderer/features/projects/api/queries';
import { trashListQuery } from '@renderer/features/trash/api/queries';
import type { TaskId, NoteId, ProjectId } from '@common/ids';

// The paged lists keep every page they load. A list that dropped its first pages (React Query's
// `maxPages`) stopped loading at that many pages, with no way to load the dropped ones again, so
// the tasks list ended at 1,000 rows (docs/performance.md).

const LISTS = {
  'tasks.list': taskListQuery({ limit: 100 }),
  'tasks.subtasks': subtasksQuery('tsk_parent' as TaskId),
  'notes.list': noteListQuery({ limit: 100 }),
  "a note's tasks": noteTasksQuery('nte_note' as NoteId),
  'projects.list': projectListQuery({ limit: 100 }),
  "a project's notes": projectNotesQuery('prj_project' as ProjectId),
  'archive.listArchived': trashListQuery('all'),
};

describe.each(Object.entries(LISTS))('%s', (_, options) => {
  it('keeps every page it loads, past ten', async () => {
    const queryClient = new QueryClient();
    // a source of 15 pages, each naming the next by its cursor
    const observer = new InfiniteQueryObserver(queryClient, {
      ...(options as object),
      queryFn: ({ pageParam }: { pageParam: unknown }) => {
        const page = typeof pageParam === 'string' ? Number(pageParam) : 0;
        return { items: [page], nextCursor: page < 14 ? String(page + 1) : null };
      },
    } as never);
    const unsubscribe = observer.subscribe(() => {});
    try {
      await observer.refetch();
      while (observer.getCurrentResult().hasNextPage) await observer.fetchNextPage();
      const pages = (observer.getCurrentResult().data as { pages: { items: number[] }[] }).pages;
      expect(pages.flatMap((page) => page.items)).toEqual([...Array(15).keys()]);
    } finally {
      unsubscribe();
      queryClient.clear();
    }
  });
});
