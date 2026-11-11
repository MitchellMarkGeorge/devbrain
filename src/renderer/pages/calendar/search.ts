import { z } from 'zod';
import { DateTime } from 'luxon';
import { isId, type EventId, type TaskId } from '@common/ids';
import type { AppSettings } from '@common/types';

// The calendar page's search params (docs/renderer/implementation-plan.md, "Search params ›
// /app/calendar"), each `.optional().catch(undefined)`, so a bad value drops that one field back to
// its default rather than failing the page. A missing param means "the setting's default" or
// "today", read at render (`resolveCalendarSearch`), so no default is ever written into the URL.
// Which calendars show is not here: core keeps it per calendar (`calendars.setVisible`).

const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const CALENDAR_VIEWS = ['week', 'month', 'day'] as const;
export type CalendarViewParam = (typeof CALENDAR_VIEWS)[number];

/** A real day written `YYYY-MM-DD` (not `2026-02-30`). */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => DateTime.fromISO(value).isValid, 'Not a date');

const sheetItem = z.custom<EventId | TaskId>(
  (value) => isId('event', value) || isId('task', value),
  'Not an event or task id',
);

export const calendarSearchSchema = z.object({
  view: optional(z.enum(CALENDAR_VIEWS)),
  /** the anchor day: the range shown is the week, day or month it falls in */
  date: optional(day),
  /** the event or task in the sheet: the agenda lists both, and the prefix says which */
  open: optional(sheetItem),
  /** with `open=evt_…` of a series: the clicked occurrence's start in it (ISO) */
  occurrence: optional(z.iso.datetime({ offset: true })),
  /** with `open=evt_…`: the sheet shows the event's note (Figma `7410:34948`) */
  sheet: optional(z.enum(['note'])),
});

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** The page's state, with every missing param filled in. */
export interface ResolvedCalendarSearch {
  view: CalendarViewParam;
  /** the anchor day, at local midnight */
  date: Date;
  /** the date param was missing: the page follows today */
  isToday: boolean;
  open: EventId | TaskId | undefined;
  occurrence: Date | undefined;
  /** the sheet shows the open event's note */
  eventNote: boolean;
}

export function resolveCalendarSearch(
  search: CalendarSearch,
  settings: Pick<AppSettings, 'calendar'>,
  today: Date,
): ResolvedCalendarSearch {
  const date = search.date
    ? DateTime.fromISO(search.date).startOf('day').toJSDate()
    : DateTime.fromJSDate(today).startOf('day').toJSDate();
  return {
    view: search.view ?? settings.calendar.defaultView,
    date,
    isToday: search.date === undefined,
    open: search.open,
    occurrence:
      search.occurrence && isId('event', search.open ?? '')
        ? new Date(search.occurrence)
        : undefined,
    eventNote: search.sheet === 'note' && isId('event', search.open ?? ''),
  };
}

/** A day as the `date` param writes it. */
export function dateParam(date: Date): string {
  return DateTime.fromJSDate(date).toISODate()!;
}

/** The sheet's search for an event: its id, and for an expanded occurrence of a series its start. */
export function openEventSearch(
  id: EventId,
  occurrence?: Date,
): Pick<CalendarSearch, 'open' | 'occurrence' | 'sheet'> {
  return { open: id, occurrence: occurrence?.toISOString(), sheet: undefined };
}
