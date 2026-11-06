import { DateTime } from 'luxon';
import { RRule, rrulestr } from 'rrule';
import type { Event } from '@common/types';

// A series' rule as FullCalendar's RRule plugin expands it, and the same expansion done here for
// views that list occurrences without FullCalendar (Home, the agenda). See
// docs/calendar/fullcalendar-adapter.md, "Recurring series".
//
// FullCalendar hands the string to rrule.js, which has three quirks the string must work around:
//
// 1. `DTSTART;VALUE=DATE:…` is dropped without an error, and the series then starts now. An
//    all-day series is written `DTSTART:20261005` instead, which rrule reads as that date.
// 2. RDATE and EXDATE values are read in DTSTART's TZID whatever their own (a `…Z` value or
//    another TZID is taken as a local time in the series' zone), and an UNTIL is compared with the
//    local times the rule makes, not with instants. So every value is rewritten as a local time
//    in the series' zone, which is what it means.
// 3. FullCalendar reads any `…Z` value after `DTSTART:`, `EXDATE:` or `UNTIL=` as a sign that
//    rrule's results are UTC, and then draws a TZID series hours off. Rewriting the values (2)
//    leaves none.
//
// The expansion here works as core's does (core/events/recurrence.ts): in local time with no zone,
// from the series' start as its local time in its zone written as UTC, each occurrence turned back
// into an instant with Luxon. A time a DST change skips moves forward by the change; of one it
// repeats, the first. That is where FullCalendar draws them too, in any system zone.

/** The series fields a rule needs (an `Event` has them all). */
export type SeriesEvent = Pick<
  Event,
  | 'startAt'
  | 'endAt'
  | 'allDay'
  | 'startDate'
  | 'endDate'
  | 'timeZone'
  | 'recurrenceRule'
  | 'exdates'
>;

/**
 * A series' rule with every value as a local time: a Date whose UTC fields are the local time in
 * `zone` (9:00 Toronto is 09:00Z), or for an all-day series the date at 00:00 UTC.
 */
export interface SeriesRule {
  allDay: boolean;
  /** the zone a timed series expands in: its own, or the system's */
  zone: string;
  start: Date;
  /** RRULE and EXRULE values (`FREQ=WEEKLY;…`), with any UNTIL a local time */
  rrules: string[];
  exrules: string[];
  rdates: Date[];
  exdates: Date[];
}

interface RuleLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

/** The system zone as an IANA name, which a series stored without one expands in (as in core). */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * The series' rule, its values read as RFC 5545 means them and written as local times in the
 * series' zone. Lines other than RRULE, EXRULE, RDATE and EXDATE (a DTSTART the provider sent) are
 * dropped, as are values that are not dates. The series' `exdates` join its EXDATEs.
 */
export function seriesRule(event: SeriesEvent): SeriesRule {
  const allDay = event.allDay && event.startDate != null;
  const zone = event.timeZone ?? localTimeZone();
  const rule: SeriesRule = {
    allDay,
    zone,
    start: allDay ? dateAsUtc(event.startDate!) : toWall(event.startAt, zone),
    rrules: [],
    exrules: [],
    rdates: [],
    exdates: [],
  };
  for (const line of ruleLines(event.recurrenceRule ?? '')) {
    if (line.name === 'RRULE' || line.name === 'EXRULE') {
      const value = localUntil(line.value, rule);
      (line.name === 'RRULE' ? rule.rrules : rule.exrules).push(value);
    } else if (line.name === 'RDATE' || line.name === 'EXDATE') {
      const dates = line.value
        .split(',')
        .map((value) => localDate(value.trim(), line.params.get('TZID'), rule))
        .filter((date): date is Date => date != null);
      (line.name === 'RDATE' ? rule.rdates : rule.exdates).push(...dates);
    }
  }
  for (const at of event.exdates ?? []) {
    rule.exdates.push(allDay ? dateAsUtc(toDateString(at)) : toWall(at, zone));
  }
  return rule;
}

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
  const stamp = (date: Date) => (rule.allDay ? dateStamp(date) : localStamp(date));
  const dated = (name: string, date: Date) =>
    rule.allDay ? `${name}:${stamp(date)}` : `${name};TZID=${rule.zone}:${stamp(date)}`;
  return [
    dated('DTSTART', rule.start),
    ...rule.rrules.map((value) => `RRULE:${value}`),
    ...rule.exrules.map((value) => `EXRULE:${value}`),
    ...rule.rdates.map((date) => dated('RDATE', date)),
    ...rule.exdates.map((date) => dated('EXDATE', date)),
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

/** One occurrence of an event: its start and end, as FullCalendar draws it. */
export interface Occurrence {
  event: Event;
  start: Date;
  end: Date;
}

/**
 * The occurrences of one event that overlap `[start, end)`, in order. A one-off event (or an
 * occurrence row) is its one occurrence when it overlaps. A series is expanded with rrule: its
 * RRULEs and RDATEs, less its EXRULEs, EXDATEs and `exdates`. An all-day occurrence runs from
 * the local midnight of its date to that of the day after its last.
 *
 * The series' moved occurrences are rows of their own, which `listForCalendar` returns beside it;
 * pass each of them too.
 */
export function occurrencesBetween(event: Event, start: Date, end: Date): Occurrence[] {
  const overlaps = (from: Date, to: Date) =>
    from.getTime() < end.getTime() && Math.max(to.getTime(), from.getTime() + 1) > start.getTime();
  if (!event.recurrenceRule || !isExpandable(rruleString(seriesRule(event)))) {
    return overlaps(event.startAt, event.endAt)
      ? [{ event, start: event.startAt, end: event.endAt }]
      : [];
  }
  const rule = seriesRule(event);
  const out: Occurrence[] = [];
  if (rule.allDay) {
    const days = daysBetween(event.startDate!, event.endDate ?? event.startDate!) || 1;
    // the window in dates, a day wider each side for the system zone's offset
    const from = new Date(dateAsUtc(toDateString(start)).getTime() - (days + 1) * DAY);
    const to = new Date(dateAsUtc(toDateString(end)).getTime() + DAY);
    const excluded = new Set([
      ...rule.exdates.map(dateStamp),
      ...expand(rule.exrules, rule, from, to).map(dateStamp),
    ]);
    const dates = new Set(
      [...expand(rule.rrules, rule, from, to), ...rule.rdates]
        .map(dateStamp)
        .filter((date) => !excluded.has(date)),
    );
    for (const date of [...dates].sort()) {
      const first = DateTime.fromFormat(date, 'yyyyMMdd');
      const occurrence = {
        event,
        start: first.toJSDate(),
        end: first.plus({ days }).toJSDate(),
      };
      if (overlaps(occurrence.start, occurrence.end)) out.push(occurrence);
    }
    return out;
  }
  const length = event.endAt.getTime() - event.startAt.getTime();
  // the window in local times, a day wider each side for the zone's offset and DST
  const from = new Date(toWall(start, rule.zone).getTime() - length - DAY);
  const to = new Date(toWall(end, rule.zone).getTime() + DAY);
  const instant = (local: Date) => fromWall(local, rule.zone).getTime();
  const excluded = new Set([
    ...rule.exdates.map(instant),
    ...expand(rule.exrules, rule, from, to).map(instant),
  ]);
  const starts = new Set(
    [...expand(rule.rrules, rule, from, to), ...rule.rdates.filter((d) => d >= from && d <= to)]
      .map(instant)
      .filter((at) => !excluded.has(at)),
  );
  for (const at of [...starts].sort((a, b) => a - b)) {
    const occurrence = { event, start: new Date(at), end: new Date(at + length) };
    if (overlaps(occurrence.start, occurrence.end)) out.push(occurrence);
  }
  return out;
}

// each RRULE or EXRULE value's occurrences in [from, to], as local times from the series' start
function expand(values: string[], rule: SeriesRule, from: Date, to: Date): Date[] {
  return values.flatMap((value) =>
    new RRule({ ...RRule.parseString(value), dtstart: rule.start }).between(from, to, true),
  );
}

// a rule's lines, split on \n with blank lines dropped; names and parameter names in upper case
function ruleLines(rule: string): RuleLine[] {
  return rule
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(':'))
    .map((line) => {
      const colon = line.indexOf(':');
      const [name, ...params] = line.slice(0, colon).split(';');
      return {
        name: name.toUpperCase(),
        params: new Map(
          params.map((param) => {
            const [key, value = ''] = param.split('=');
            return [key.toUpperCase(), value];
          }),
        ),
        value: line.slice(colon + 1),
      };
    });
}

/**
 * An RDATE or EXDATE value as a local time of the series (see SeriesRule), or null when it is not
 * a date:
 *
 * - a DATE (`20261009`): that date (all-day), or its midnight in the series' zone;
 * - a UTC DATE-TIME (`…T130000Z`): that instant;
 * - a floating or TZID DATE-TIME (`…T090000`): that local time in the line's TZID, or the series'
 *   zone when it names none.
 *
 * For an all-day series a DATE-TIME names the system-zone date of its instant.
 */
function localDate(value: string, tzid: string | undefined, rule: SeriesRule): Date | null {
  const match = /^(\d{8})(?:T(\d{6})(Z?))?$/i.exec(value);
  if (!match) return null;
  const [, date, time, utc] = match;
  if (time == null) {
    return DateTime.fromFormat(date, 'yyyyMMdd', { zone: 'utc' }).toJSDate();
  }
  const zone = utc ? 'utc' : (tzid ?? rule.zone);
  const instant = DateTime.fromFormat(`${date}T${time}`, "yyyyMMdd'T'HHmmss", { zone });
  if (!instant.isValid) return null;
  if (rule.allDay) return dateAsUtc(toDateString(instant.toJSDate()));
  return zone === rule.zone
    ? DateTime.fromFormat(`${date}T${time}`, "yyyyMMdd'T'HHmmss", { zone: 'utc' }).toJSDate()
    : toWall(instant.toJSDate(), rule.zone);
}

/**
 * An RRULE or EXRULE value with a UTC UNTIL (which RFC 5545 requires when DTSTART has a TZID)
 * rewritten as the local time it is in the series' zone, which rrule compares the rule's local
 * times with. An all-day series' UTC UNTIL just loses its `Z`, which rrule reads the same.
 */
function localUntil(value: string, rule: SeriesRule): string {
  return value.replace(/(^|;)UNTIL=(\d{8}T\d{6})Z(?=;|$)/i, (_, lead: string, stamp: string) => {
    if (rule.allDay) return `${lead}UNTIL=${stamp}`;
    const instant = DateTime.fromFormat(stamp, "yyyyMMdd'T'HHmmss", { zone: 'utc' }).toJSDate();
    return `${lead}UNTIL=${localStamp(toWall(instant, rule.zone))}`;
  });
}

const DAY = 24 * 60 * 60 * 1000;

// an instant's local time in a zone, as a Date whose UTC fields are that time (as in core)
function toWall(at: Date, zone: string): Date {
  return DateTime.fromJSDate(at, { zone }).setZone('utc', { keepLocalTime: true }).toJSDate();
}

// toWall's inverse: a skipped time moves forward by the change, a repeated one is the first
function fromWall(local: Date, zone: string): Date {
  return DateTime.fromJSDate(local, { zone: 'utc' })
    .setZone(zone, { keepLocalTime: true })
    .toJSDate();
}

// a YYYY-MM-DD date at 00:00 UTC
function dateAsUtc(date: string): Date {
  return DateTime.fromISO(date, { zone: 'utc' }).toJSDate();
}

// the local day an instant falls on, as YYYY-MM-DD
function toDateString(at: Date): string {
  return DateTime.fromJSDate(at).toISODate()!;
}

// a local time (UTC fields) as an RFC 5545 floating DATE-TIME: 20261005T090000
function localStamp(local: Date): string {
  return DateTime.fromJSDate(local, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss");
}

// a date at 00:00 UTC as an RFC 5545 DATE: 20261005
function dateStamp(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyyMMdd');
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    DateTime.fromISO(to, { zone: 'utc' }).diff(DateTime.fromISO(from, { zone: 'utc' }), 'days')
      .days,
  );
}
