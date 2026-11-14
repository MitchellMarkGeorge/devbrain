import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';
import { toWall, type SeriesRule } from '@common/recurrence';

// A series' rule as FullCalendar's RRule plugin takes it. Reading the rule (its values as the
// instants they name, a UTC UNTIL as a local time) is @common/recurrence, shared with core; this
// only writes that reading in the string form FullCalendar hands to rrule, which has two quirks of
// its own (docs/calendar/fullcalendar-adapter.md, "Findings"):
//
// 1. rrule drops `DTSTART;VALUE=DATE:…` without an error, and the series then starts now. An
//    all-day series is written `DTSTART:20261005` instead.
// 2. FullCalendar reads any `…Z` value after `DTSTART:`, `EXDATE:` or `UNTIL=` as a sign that
//    rrule's results are UTC, and then draws a TZID series hours off. Every value is written as a
//    local time in the series' zone, with that zone's TZID, so there is none.

/**
 * The `rrule` string FullCalendar expands:
 *
 * ```
 * DTSTART;TZID=America/Toronto:20261005T090000     DTSTART:20261005
 * RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR           RRULE:FREQ=YEARLY
 * EXDATE;TZID=America/Toronto:20261009T090000      EXDATE:20261009
 * ```
 */
export function rruleString(rule: SeriesRule): string {
  // the start is already a local time; RDATEs and EXDATEs are instants (all-day: dates)
  const local = (date: Date) =>
    DateTime.fromJSDate(date, { zone: 'utc' }).toFormat(
      rule.allDay ? 'yyyyMMdd' : "yyyyMMdd'T'HHmmss",
    );
  const line = (name: string, date: Date) =>
    rule.allDay ? `${name}:${local(date)}` : `${name};TZID=${rule.zone}:${local(date)}`;
  const instant = (name: string, at: Date) => line(name, rule.allDay ? at : toWall(at, rule.zone));
  return [
    line('DTSTART', rule.start),
    ...rule.rrules.map((value) => `RRULE:${value}`),
    ...rule.exrules.map((value) => `EXRULE:${value}`),
    ...rule.rdates.map((at) => instant('RDATE', at)),
    ...rule.exdates.map((at) => instant('EXDATE', at)),
  ].join('\n');
}

/**
 * Whether rrule can expand the string. A provider's rule is stored as it was sent, and one rrule
 * cannot read would make FullCalendar throw for the whole source; such a series is drawn as its
 * first occurrence instead.
 */
export function isExpandable(rrule: string): boolean {
  try {
    rrulestr(rrule, { forceset: true }).all((_, index) => index < 1);
    return true;
  } catch {
    return false;
  }
}
