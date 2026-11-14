import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { RouterContext } from '@renderer/app/router';
import { trpc } from '@renderer/ipc';
import { PROJECT_DAYS, type HomeData } from '../lib/summary';

// Home's reads (implementation plan, Home › "Keeping it current costs no polling"). Each is keyed
// by the day it was asked on, so the date ranges move at midnight and at no other time: between
// midnight and midnight only a change main reports refetches them.

/** The start of today, as the loader and the page key Home's reads. */
export function startOfToday(now: Date = new Date()): Date {
  return DateTime.fromJSDate(now).startOf('day').toJSDate();
}

/** Every read Home's summary is computed from, for the day `today` starts. */
export function homeQueries(today: Date) {
  const day = DateTime.fromJSDate(today).startOf('day');
  return {
    // today's and tomorrow's meetings; series come once, expanded on the page
    events: trpc.events.listForCalendar.queryOptions({
      start: day.toJSDate(),
      end: day.plus({ days: 2 }).toJSDate(),
    }),
    // open tasks due today or before (core compares dueBefore strictly)
    dueTasks: trpc.tasks.list.queryOptions({
      filter: { dueBefore: day.plus({ days: 1 }).toJSDate(), excludeClosed: true },
      sort: { sortBy: 'dueDate', direction: 'asc' },
      limit: 100,
    }),
    // whether there is any task at all ("You don't have any tasks yet")
    anyTask: trpc.tasks.list.queryOptions({ limit: 1 }),
    dueProjects: trpc.projects.list.queryOptions({
      filter: { dueBefore: day.plus({ days: PROJECT_DAYS }).toJSDate() },
      sort: { sortBy: 'dueDate', direction: 'asc' },
      limit: 20,
    }),
    recentProjects: trpc.projects.list.queryOptions({
      sort: { sortBy: 'updatedAt', direction: 'desc' },
      limit: 10,
    }),
    recentNotes: trpc.recents.list.queryOptions({ entityType: 'notes', limit: 3 }),
    integrations: trpc.integrations.list.queryOptions(),
  };
}

/** The route's loader: Home's reads, so the page draws whole on its first frame. */
export async function loadHome({ queryClient }: RouterContext): Promise<void> {
  const queries = homeQueries(startOfToday());
  await Promise.all([
    ...Object.values(queries).map((options) =>
      queryClient.query({
        ...(options as Parameters<typeof queryClient.query>[0]),
        staleTime: 'static',
      }),
    ),
    queryClient.query({ ...trpc.calendars.list.queryOptions(), staleTime: 'static' }),
  ]);
}

/**
 * Home's data for `today`, or undefined until every read has answered once. At midnight the keys
 * change, and the previous day's data stays up until the new day's arrives (so Home never blanks).
 */
export function useHomeData(today: Date, now: Date) {
  const queries = homeQueries(today);
  const keep = { placeholderData: keepPreviousData };
  const events = useQuery({ ...queries.events, ...keep });
  const dueTasks = useQuery({ ...queries.dueTasks, ...keep });
  const anyTask = useQuery(queries.anyTask);
  const dueProjects = useQuery({ ...queries.dueProjects, ...keep });
  const recentProjects = useQuery(queries.recentProjects);
  const recentNotes = useQuery(queries.recentNotes);
  const integrations = useQuery(queries.integrations);
  const all = [events, dueTasks, anyTask, dueProjects, recentProjects, recentNotes, integrations];

  const data: HomeData | undefined =
    events.data &&
    dueTasks.data &&
    anyTask.data &&
    dueProjects.data &&
    recentProjects.data &&
    recentNotes.data &&
    integrations.data
      ? {
          now,
          events: events.data,
          dueTasks: dueTasks.data.items,
          hasTasks: anyTask.data.items.length > 0,
          dueProjects: dueProjects.data.items,
          recentProjects: recentProjects.data.items,
          recentNotes: recentNotes.data.items.flatMap((recent) =>
            recent.entityType === 'notes' ? [recent.entity] : [],
          ),
          integrations: integrations.data,
        }
      : undefined;
  return {
    data,
    isError: !data && all.some((query) => query.isError),
    retry: () => all.forEach((query) => query.isError && void query.refetch()),
  };
}
