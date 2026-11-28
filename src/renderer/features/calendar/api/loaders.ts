import { noop } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { RouterContext } from '@renderer/app/router';
import { calendarEventsQuery, tasksDueBetweenQuery } from './queries';
import { rangeOptionsOf, visibleRange } from '../lib/range';
import { resolveCalendarSearch, type CalendarSearch } from './search';

// What the calendar route loads before its first frame (routes/app/$workspaceId/calendar.tsx): it
// only primes React Query's cache, which the page reads.

/** The start of today: the anchor when the URL names no date. */
export function today(): Date {
  return DateTime.now().startOf('day').toJSDate();
}

/** What the loader depends on: the range shown. Opening the sheet reloads nothing. */
export function calendarLoaderDeps({ search }: { search: CalendarSearch }) {
  return { view: search.view, date: search.date };
}

/**
 * The settings (the view's defaults, the first day of the week), the calendars and the workspace
 * (whether its calendar shows tasks), awaited; the visible calendars' events for the range shown,
 * and the tasks due in it, started but not awaited, since a range before what a synced calendar
 * mirrors fetches its history from the provider first (the page shows its skeleton meanwhile).
 */
export async function loadCalendar(
  { queryClient, trpc }: RouterContext,
  search: Pick<CalendarSearch, 'view' | 'date'>,
) {
  const [settings, calendars, workspace] = await Promise.all([
    queryClient.query({ ...trpc.settings.get.queryOptions(), staleTime: 'static' }),
    queryClient.query({ ...trpc.calendars.list.queryOptions(), staleTime: 'static' }),
    queryClient.query({ ...trpc.workspaces.current.queryOptions(), staleTime: 'static' }),
  ]);
  const resolved = resolveCalendarSearch(search, settings, today());
  const range = visibleRange(resolved.view, resolved.date, rangeOptionsOf(settings, resolved.view));
  for (const calendar of calendars.filter((c) => c.visible)) {
    queryClient.query(calendarEventsQuery(calendar.id, range)).catch(noop);
  }
  if (workspace?.settings.calendar.showTasks ?? true) {
    queryClient.query(tasksDueBetweenQuery(range)).catch(noop);
  }
}
