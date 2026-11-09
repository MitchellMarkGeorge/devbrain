import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import type { Event } from './types';

// A recurring series' occurrences: one reading of a stored rule, and one expansion of it, shared
// by core (which checks the occurrences an edit names) and the renderer (which lists them, and
// hands the same reading to FullCalendar). An occurrence's start identifies it (an occurrence ref
// is the series and that start), so both sides must agree on it to the millisecond.
//
// A rule is the RFC 5545 lines a series stores (RRULE, EXRULE, RDATE, EXDATE, joined with \n) as
// its source wrote them, with no DTSTART: the series' start is its DTSTART. It is expanded with
// rrule, which needs three things done for it:
//
// 1. Its values read as RFC 5545 means them. rrule reads every RDATE and EXDATE value in DTSTART's
//    zone, whatever the line's own TZID or a `Z` says, and compares an UNTIL with the local times
//    the rule makes rather than with instants. So each RDATE and EXDATE value is read into the
//    instant it names (seriesRule), and a UTC UNTIL rewritten as the local time it is in the
//    series' zone (which RFC 5545 requires to be UTC when DTSTART has a TZID, as Google sends it).
// 2. Expanding in local time. rrule can expand in a named zone (tzid), but the instants it then
//    returns depend on the system zone. So a rule is expanded with no zone, from the series' start
//    as its local time in its zone written as UTC (9:00 New York is 09:00Z), and each local time
//    turned back into an instant with Luxon (fromWall). A 9:00 series stays at 9:00 across DST; a
//    time a DST change skips moves forward by the change (2:30 is 3:30), and of one it repeats,
//    the first. FullCalendar draws a `DTSTART;TZID=…` series at the same instants.
// 3. An all-day series expanded by its dates (YYYY-MM-DD at 00:00 UTC), each occurrence starting
//    at the local midnight of its date, as all-day dates do everywhere (see core/shared/dates.ts).

/** The series fields a rule is read against (an `Event` has them all). */
export interface SeriesTiming {
  startAt: Date;
  allDay: boolean;
  startDate: string | null;
  timeZone: string | null;
}

/** One line of a rule, `NAME;PARAM=VALUE;…:VALUE`, its name and parameter names in upper case. */
export interface RuleLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

/** A line of a rule that is not `NAME…:VALUE`, such as an RRULE written without `RRULE:`. */
export class RuleLineError extends Error {
  constructor(line: string) {
    super(`Not a recurrence line: ${line}`);
    this.name = 'RuleLineError';
  }
}

/**
 * A series' rule as values rrule can expand correctly:
 *
 * - `start`: the series' start as a local time (a Date whose UTC fields are its local time in
 *   `zone`), or for an all-day series its start date at 00:00 UTC;
 * - `rrules` and `exrules`: the RRULE and EXRULE values (`FREQ=WEEKLY;…`), a UTC UNTIL rewritten
 *   as the local time it is in `zone` (all-day: the same digits without the `Z`);
 * - `rdates` and `exdates`: the instants the RDATE and EXDATE values name, and any exclusions
 *   passed in; for an all-day series, their dates at 00:00 UTC.
 */
export interface SeriesRule {
  allDay: boolean;
  /** the zone a timed series expands in: its own, or the system's for one stored without */
  zone: string;
  start: Date;
  rrules: string[];
  exrules: string[];
  rdates: Date[];
  exdates: Date[];
}

/** The system zone as an IANA name. */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A rule's lines, split on \n with blank lines dropped. Throws RuleLineError for a line without a
 * `:`; core's checkRule turns that into invalid_input.
 */
export function ruleLines(rule: string): RuleLine[] {
  return rule
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon === -1) throw new RuleLineError(line);
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
 * The series' rule read for expanding (see SeriesRule). Lines other than RRULE, EXRULE, RDATE and
 * EXDATE (a provider's DTSTART) are dropped, as are lines without a `:` and values that are not
 * dates: core refuses those when a rule is written (checkRule), and a provider's rule is read as
 * well as it can be. `exclude` adds instants the series no longer has, such as an event's
 * `exdates` (its cancelled occurrences and occurrence rows).
 */
export function seriesRule(series: SeriesTiming, rule: string, exclude: Date[] = []): SeriesRule {
  const allDay = series.allDay && series.startDate != null;
  const zone = series.timeZone ?? localTimeZone();
  const read: SeriesRule = {
    allDay,
    zone,
    start: allDay ? dateAsUtc(series.startDate!) : toWall(series.startAt, zone),
    rrules: [],
    exrules: [],
    rdates: [],
    exdates: [],
  };
  const lines = rule
    .split('\n')
    .filter((line) => line.includes(':'))
    .join('\n');
  for (const line of ruleLines(lines)) {
    if (line.name === 'RRULE' || line.name === 'EXRULE') {
      (line.name === 'RRULE' ? read.rrules : read.exrules).push(localUntil(line.value, read));
    } else if (line.name === 'RDATE' || line.name === 'EXDATE') {
      const dates = line.value
        .split(',')
        .map((value) => readDate(value.trim(), line.params.get('TZID'), read))
        .filter((date): date is Date => date != null);
      (line.name === 'RDATE' ? read.rdates : read.exdates).push(...dates);
    }
  }
  for (const at of exclude) read.exdates.push(allDay ? dateAsUtc(toDateString(at)) : at);
  return read;
}

/**
 * The instants occurrences of the series start at within `[from, to]`, in order: what its RRULEs
 * and RDATEs make, less what its EXRULEs and EXDATEs make. For an all-day series, the local
 * midnights of their dates. Throws when rrule cannot expand a value (core refuses such rules on
 * write; occurrencesBetween falls back for a provider's).
 */
export function occurrenceStarts(rule: SeriesRule, from: Date, to: Date): Date[] {
  if (rule.allDay) {
    // the dates whose local midnight can fall in the range
    const first = dateAsUtc(toDateString(from));
    const last = dateAsUtc(toDateString(to));
    const key = (date: Date) => date.getTime();
    const excluded = new Set([
      ...rule.exdates.map(key),
      ...expand(rule.exrules, rule, first, last).map(key),
    ]);
    const dates = new Map<number, Date>();
    for (const date of [...expand(rule.rrules, rule, first, last), ...rule.rdates]) {
      if (!excluded.has(key(date))) dates.set(key(date), date);
    }
    return [...dates.values()]
      .map((date) => localMidnight(date))
      .filter((at) => at >= from && at <= to)
      .sort((a, b) => a.getTime() - b.getTime());
  }
  // local times a little wider than the range, since a DST change moves them by up to an hour
  const lo = new Date(toWall(from, rule.zone).getTime() - 2 * HOUR);
  const hi = new Date(toWall(to, rule.zone).getTime() + 2 * HOUR);
  const instant = (local: Date) => fromWall(local, rule.zone).getTime();
  const excluded = new Set([
    ...rule.exdates.map((at) => at.getTime()),
    ...expand(rule.exrules, rule, lo, hi).map(instant),
  ]);
  const starts = new Set([
    ...expand(rule.rrules, rule, lo, hi).map(instant),
    ...rule.rdates.map((at) => at.getTime()),
  ]);
  return [...starts]
    .filter((at) => !excluded.has(at) && at >= from.getTime() && at <= to.getTime())
    .sort((a, b) => a - b)
    .map((at) => new Date(at));
}

/**
 * Whether the series has an occurrence starting exactly at `at`: a whole second, for an all-day
 * series the start of a local day, and one of its occurrenceStarts.
 */
export function isOccurrenceStart(rule: SeriesRule, at: Date): boolean {
  if (at.getTime() % 1000 !== 0) return false;
  if (rule.allDay && localMidnight(dateAsUtc(toDateString(at))).getTime() !== at.getTime()) {
    return false;
  }
  return occurrenceStarts(rule, at, at).length > 0;
}

/**
 * Whether an RRULE or RDATE of the series makes an occurrence before `at`, exclusions aside: false
 * means `at` is its first occurrence. That is not `startAt` when the rule skips the start's day (a
 * series created on a Wednesday with BYDAY=MO starts drawing on the Monday after). An excluded or
 * cancelled earlier occurrence still counts.
 */
export function hasOccurrenceBefore(rule: SeriesRule, at: Date): boolean {
  const before = localOf(rule, at);
  if (rule.rrules.some((value) => rruleOf(value, rule).before(before) !== null)) return true;
  return rule.rdates.some((date) => (rule.allDay ? date < before : date < at));
}

/** An RRULE or EXRULE value of the series as an rrule RRule, from its start, in local time. */
export function rruleOf(value: string, rule: SeriesRule): RRule {
  return new RRule({ ...RRule.parseString(value), dtstart: rule.start });
}

/** An instant as the series expands it: its local time in the zone, or its date if all-day. */
export function localOf(rule: SeriesRule, at: Date): Date {
  return rule.allDay ? dateAsUtc(toDateString(at)) : toWall(at, rule.zone);
}

/** One occurrence of an event: where it starts and ends. */
export interface Occurrence {
  event: Event;
  start: Date;
  end: Date;
}

/**
 * The occurrences of one event that overlap `[start, end)`, in order. A one-off event (or an
 * occurrence row) is its one occurrence when it overlaps. A series is expanded with its `exdates`
 * left out; each occurrence lasts as long as the series' first (all-day: as many days). A series
 * rrule cannot expand is its first occurrence, as the calendar draws it.
 *
 * Moved occurrences are rows of their own, which `listForCalendar` returns beside the series:
 * pass each of them too.
 */
export function occurrencesBetween(event: Event, start: Date, end: Date): Occurrence[] {
  const overlaps = (from: Date, to: Date) =>
    from.getTime() < end.getTime() && Math.max(to.getTime(), from.getTime() + 1) > start.getTime();
  const single = () =>
    overlaps(event.startAt, event.endAt) ? [{ event, start: event.startAt, end: event.endAt }] : [];
  if (!event.recurrenceRule) return single();

  const rule = seriesRule(event, event.recurrenceRule, event.exdates ?? []);
  const days = rule.allDay
    ? Math.max(1, daysBetween(event.startDate!, event.endDate ?? event.startDate!))
    : 0;
  const length = event.endAt.getTime() - event.startAt.getTime();
  // an occurrence starting before the range can still overlap it
  const reach = rule.allDay ? (days + 1) * DAY : length;
  let starts: Date[];
  try {
    starts = occurrenceStarts(rule, new Date(start.getTime() - reach), end);
  } catch {
    return single();
  }
  return starts
    .map((at) => ({
      event,
      start: at,
      end: rule.allDay
        ? DateTime.fromJSDate(at).plus({ days }).startOf('day').toJSDate()
        : new Date(at.getTime() + length),
    }))
    .filter((occurrence) => overlaps(occurrence.start, occurrence.end));
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    DateTime.fromISO(to, { zone: 'utc' }).diff(DateTime.fromISO(from, { zone: 'utc' }), 'days')
      .days,
  );
}

/** An instant's local time in a zone, as a Date whose UTC fields are that time: 14:00Z in New York in November is 09:00Z. */
export function toWall(at: Date, zone: string): Date {
  return DateTime.fromJSDate(at, { zone }).setZone('utc', { keepLocalTime: true }).toJSDate();
}

/**
 * The instant a local time in a zone is, from a Date whose UTC fields are that time: toWall's
 * inverse. A time a DST change skips moves forward by the change (2:30 is 3:30); of one it
 * repeats (1:30 when 2:00 goes back to 1:00), the first.
 */
export function fromWall(local: Date, zone: string): Date {
  return DateTime.fromJSDate(local, { zone: 'utc' })
    .setZone(zone, { keepLocalTime: true })
    .toJSDate();
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STAMP = "yyyyMMdd'T'HHmmss";

// each RRULE or EXRULE value's local times in [from, to]
function expand(values: string[], rule: SeriesRule, from: Date, to: Date): Date[] {
  return values.flatMap((value) => rruleOf(value, rule).between(from, to, true));
}

/**
 * The instant an RDATE or EXDATE value names, or null when it is not a date:
 *
 * - a DATE (`20261009`): that date (all-day), or its midnight in the series' zone;
 * - a UTC DATE-TIME (`…T130000Z`): that instant;
 * - a floating or TZID DATE-TIME (`…T090000`): that local time in the line's TZID, or the series'
 *   zone when it names none, resolved as fromWall does when DST skips or repeats it.
 *
 * For an all-day series, a DATE-TIME names the system-zone date of its instant.
 */
function readDate(value: string, tzid: string | undefined, rule: SeriesRule): Date | null {
  const match = /^(\d{8})(?:T(\d{6})(Z?))?$/i.exec(value);
  if (!match) return null;
  const [, date, time, utc] = match;
  if (time == null) {
    const day = DateTime.fromFormat(date, 'yyyyMMdd', { zone: rule.allDay ? 'utc' : rule.zone });
    return day.isValid ? day.toJSDate() : null;
  }
  const instant = DateTime.fromFormat(`${date}T${time}`, STAMP, {
    zone: utc ? 'utc' : (tzid ?? rule.zone),
  });
  if (!instant.isValid) return null;
  return rule.allDay ? dateAsUtc(toDateString(instant.toJSDate())) : instant.toJSDate();
}

// An RRULE or EXRULE value with a UTC UNTIL rewritten as the local time it is in the series'
// zone, which rrule compares the rule's local times with; for an all-day series, without its `Z`.
function localUntil(value: string, rule: SeriesRule): string {
  return value.replace(/(^|;)UNTIL=(\d{8}T\d{6})Z(?=;|$)/i, (_, lead: string, stamp: string) => {
    if (rule.allDay) return `${lead}UNTIL=${stamp}`;
    const instant = DateTime.fromFormat(stamp, STAMP, { zone: 'utc' }).toJSDate();
    const local = DateTime.fromJSDate(toWall(instant, rule.zone), { zone: 'utc' });
    return `${lead}UNTIL=${local.toFormat(STAMP)}`;
  });
}

// a YYYY-MM-DD date at 00:00 UTC
function dateAsUtc(date: string): Date {
  return DateTime.fromISO(date, { zone: 'utc' }).toJSDate();
}

// the local date an instant falls on, as YYYY-MM-DD
function toDateString(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// the local midnight of a date held at 00:00 UTC (the first moment of the day where DST skips
// midnight), as all-day dates start
function localMidnight(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
