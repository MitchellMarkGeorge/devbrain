import { DateTime } from 'luxon';
import type { Event } from '@common/types';
import type { EventPatch } from '../edit/occurrence';

// The timing changes the sheet's pills make to the occurrence shown (its start and end, which for
// an expanded occurrence of a series are the occurrence's, not the series'), as an update's fields.

export interface ShownTiming {
  start: Date;
  /** exclusive; an all-day occurrence's is the midnight after its last day */
  end: Date;
  allDay: boolean;
}

const isoDay = (date: DateTime) => date.toISODate()!;

/** The occurrence moved to `day`, keeping its times (an all-day one keeps its length in days). */
export function moveToDay(shown: ShownTiming, day: Date): EventPatch {
  const days = Math.round(
    DateTime.fromJSDate(day)
      .startOf('day')
      .diff(DateTime.fromJSDate(shown.start).startOf('day'), 'days').days,
  );
  const start = DateTime.fromJSDate(shown.start).plus({ days });
  const end = DateTime.fromJSDate(shown.end).plus({ days });
  if (shown.allDay) {
    return { allDay: true, startDate: isoDay(start), endDate: isoDay(end) };
  }
  return { startAt: start.toJSDate(), endAt: end.toJSDate() };
}

/** A new start time, keeping the length. */
export function moveStart(shown: ShownTiming, start: Date): EventPatch {
  return {
    startAt: start,
    endAt: new Date(start.getTime() + shown.end.getTime() - shown.start.getTime()),
  };
}

/** A new end time; one at or before the start is refused (null). */
export function moveEnd(shown: ShownTiming, end: Date): EventPatch | null {
  return end.getTime() > shown.start.getTime() ? { endAt: end } : null;
}

/** The occurrence shown: a series' expanded one, or the event's own timing. */
export function shownTiming(
  event: Event,
  occurrence: { start: Date; end: Date } | null,
): ShownTiming {
  return {
    start: occurrence?.start ?? event.startAt,
    end: occurrence?.end ?? event.endAt,
    allDay: event.allDay,
  };
}

/** The time zone's short name at a moment: "EDT". */
export function zoneAbbreviation(at: Date, zone?: string | null): string {
  return DateTime.fromJSDate(at, zone ? { zone } : undefined).toFormat('ZZZZ');
}
