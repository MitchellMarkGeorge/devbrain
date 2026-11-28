import { z } from 'zod';
import { DateTime } from 'luxon';
import type { EventId } from '@common/ids';
import type { AppSettings } from '@common/types';
import { sheetParam } from '@renderer/shared/lib/sheet';

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

export const calendarSearchSchema = z.object({
  view: optional(z.enum(CALENDAR_VIEWS)),
  /** the anchor day: the range shown is the week, day or month it falls in */
  date: optional(day),
  /** the event, task or note in the sheet: the id's prefix says which */
  sheet: sheetParam('/app/$workspaceId/calendar'),
  /**
   * with `sheet=evt_…` of a series: the clicked occurrence's start in it (ISO); kept with
   * `sheet=nte_…`, the event's note opened from that occurrence
   */
  occurrence: optional(z.iso.datetime({ offset: true })),
});

export type CalendarSearch = z.infer<typeof calendarSearchSchema>;

/** The page's state, with every missing param filled in. */
export interface ResolvedCalendarSearch {
  view: CalendarViewParam;
  /** the anchor day, at local midnight */
  date: Date;
  /** the date param was missing: the page follows today */
  isToday: boolean;
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
  };
}

/** The sheet's search for an event: its id, and for an expanded occurrence of a series its start. */
export function openEventSearch(
  id: EventId,
  occurrence?: Date,
): Pick<CalendarSearch, 'sheet' | 'occurrence'> {
  return { sheet: id, occurrence: occurrence?.toISOString() };
}
