import { createFileRoute } from '@tanstack/react-router';
import { CalendarPage } from '@renderer/features/calendar/components/CalendarPage';
import { calendarLoaderDeps, loadCalendar } from '@renderer/features/calendar/api/loaders';
import { calendarSearchSchema } from '@renderer/features/calendar/api/search';

// The calendar: week, day or month from the URL (?view=month&date=2026-06-22), and the sheet at
// ?open=evt_… (with ?occurrence= for one of a series) or ?open=tsk_….
export const Route = createFileRoute('/app/$workspaceId/calendar')({
  staticData: { title: 'Calendar' },
  validateSearch: calendarSearchSchema,
  loaderDeps: calendarLoaderDeps,
  loader: ({ context, deps }) => loadCalendar(context, deps),
  component: CalendarPage,
});
