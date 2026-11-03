import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import { InvalidInputError } from '../shared/errors';
import { fromDateString, localTimeZone, toDateString } from '../shared/dates';

// A series' recurrence rule, for EventService's occurrence edits. A rule is RFC 5545 lines joined
// with \n (see Event.recurrenceRule), without DTSTART: the series' startAt is its start. This
// module does three things with one:
//
// 1. Checks it (checkRule), when an event is created or updated with one, so every stored local
//    rule is one FullCalendar can expand and the functions below can read.
// 2. Recognises its occurrences (isOccurrence, hasOccurrenceBefore), so an occurrence edit only
//    acts on one the calendar shows, and knows when it is at the series' first.
// 3. Splits it at an occurrence, for "this and following" edits and deletes: the part before ends
//    just before it (ruleEndingBefore) and the part after starts there (ruleContinuingFrom).
//    Splitting supports one RRULE with any EXDATE lines. RDATE and EXRULE are refused: an RDATE is
//    not bounded by UNTIL, so the part before would keep any after the split.
//
// Expanding in wall-clock time. rrule can expand in a named zone (tzid), but the instants it then
// returns depend on the system zone. So a rule is expanded with no zone, from the series' start
// as its local time in the series' zone written as UTC (9:00 New York is 09:00Z), and compared
// with instants written the same way (toWall). A 9:00 series stays 9:00 across DST, as
// FullCalendar expands `DTSTART;TZID=…`. Where an exact instant matters, a local time is turned
// back into one with fromWall, which resolves the times DST skips or repeats as Luxon does. An
// all-day series is expanded by its dates (YYYY-MM-DD at 00:00 UTC) instead.

interface SeriesTiming {
  startAt: Date;
  allDay: boolean;
  startDate: string | null;
  timeZone: string | null;
}

// the lines a local series' rule may have (DTSTART comes from the event's start)
const LINE_NAMES = new Set(['RRULE', 'EXRULE', 'RDATE', 'EXDATE']);
// an RDATE or EXDATE value: a DATE, a floating or TZID DATE-TIME, or a UTC one
const DATE_VALUE = /^\d{8}(T\d{6}Z?)?$/;

// one line of a rule, `NAME;PARAM=VALUE;…:VALUE`, with its name and parameter names in upper case
interface RuleLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

/**
 * Refuses, with InvalidInputError, a rule FullCalendar could not expand or occurrence edits could
 * not read, and returns any other as it was, unchanged. EventService calls it on createEvent,
 * updateEvent and a "following" edit's new rule, and again on a stored rule before an occurrence
 * edit reads it (one stored before rules were checked may not pass).
 *
 * 1. Every line must be `NAME…:VALUE` (ruleLines), named RRULE, EXRULE, RDATE or EXDATE. DTSTART is
 *    refused: the adapter writes it from startAt, and a second one would conflict.
 * 2. An RRULE or EXRULE line must be one rrule can expand (checkRRule).
 * 3. An RDATE or EXDATE value must be a comma-separated list of DATEs (YYYYMMDD) or DATE-TIMEs
 *    (YYYYMMDDTHHMMSS, with Z for UTC), the forms instantOf reads.
 * 4. There must be at least one RRULE line: a series made only of RDATEs is not supported.
 *
 * Splitting has further limits (parseRule), checked only when a split is asked for, since a rule
 * that cannot be split is still a valid series.
 */
export function checkRule(rule: string): string {
  const lines = ruleLines(rule);
  for (const line of lines) {
    if (!LINE_NAMES.has(line.name)) {
      throw new InvalidInputError(`A recurrence rule cannot have a ${line.name} line`);
    }
    if (line.name === 'RRULE' || line.name === 'EXRULE') {
      checkRRule(line);
    } else if (!line.value.split(',').every((value) => DATE_VALUE.test(value))) {
      throw new InvalidInputError(`Not a list of dates: ${line.value}`);
    }
  }
  if (!lines.some((line) => line.name === 'RRULE')) {
    throw new InvalidInputError('A recurrence rule needs an RRULE line');
  }
  return rule;
}

/**
 * Refuses an RRULE or EXRULE line rrule cannot expand. rrule's parser alone is not enough, so
 * there are three steps:
 *
 * 1. Parse it, which throws on an unknown part (FOO=1) or a malformed value (UNTIL=garbage).
 * 2. Expand its first occurrence, which throws on values the parser lets through, such as
 *    BYDAY=XX or a lowercase weekday.
 * 3. Require a FREQ (the parser reads an unknown one, FREQ=SOMETIMES, as none), and refuse COUNT
 *    with UNTIL, which RFC 5545 forbids and ruleContinuingFrom could not lower consistently.
 */
function checkRRule(line: RuleLine): void {
  const invalid = new InvalidInputError(`Not a valid ${line.name}: ${line.value}`);
  let options;
  try {
    // throws on an unknown part or value, but reads an unknown FREQ as none
    options = RRule.parseString(line.value);
    // and some values only fail once it expands
    new RRule(options).all((_, index) => index < 1);
  } catch {
    throw invalid;
  }
  if (options.freq === undefined || options.freq === null) throw invalid;
  // RFC 5545: a rule has one or the other
  if (options.count != null && options.until != null) throw invalid;
}

/**
 * Whether the series' rule has an occurrence starting exactly at `at`, as FullCalendar draws it.
 * EventService.getSeries uses it to refuse an occurrence edit for a time the calendar does not
 * show, which would otherwise make a phantom occurrence row, or move an ended series' UNTIL later
 * and bring occurrences back.
 *
 * 1. `at` must be a whole second, and for an all-day series the start of a local day
 *    (fromDateString), the only instants an occurrence can start at.
 * 2. An RRULE line must make it (rruleMakes), or an RDATE line list it (instantOf).
 * 3. No EXRULE line may make it, and no EXDATE line list it.
 *
 * Only the rule is consulted. The series' cancelled occurrences (event_exceptions) and occurrence
 * rows are not: they are slots of the series too, and getSeries accepts those itself, including
 * ones the rule no longer makes since it was edited.
 */
export function isOccurrence(rule: string, series: SeriesTiming, at: Date): boolean {
  if (at.getTime() % 1000 !== 0) return false;
  if (series.allDay && fromDateString(toDateString(at)).getTime() !== at.getTime()) return false;
  const lines = ruleLines(rule);
  const makes = (line: RuleLine) =>
    line.name === 'RRULE' || line.name === 'EXRULE'
      ? rruleMakes(line, series, at)
      : line.value.split(',').some((value) => instantOf(value, line, series) === at.getTime());
  const made = lines.filter((line) => line.name === 'RRULE' || line.name === 'RDATE').some(makes);
  return (
    made && !lines.filter((line) => line.name === 'EXRULE' || line.name === 'EXDATE').some(makes)
  );
}

/**
 * Whether an RRULE or RDATE line of the series makes an occurrence before `at`: false means `at`
 * is the series' first occurrence. EventService uses it rather than comparing with startAt,
 * because the two differ when the rule skips the start's day (a series created on a Wednesday
 * with BYDAY=MO starts drawing on the Monday after). A "following" edit or delete at the first
 * occurrence then updates or deletes the series itself instead of splitting off an empty part.
 *
 * EXRULE and EXDATE lines, and cancelled occurrences, are not consulted: an earlier occurrence
 * that is excluded or cancelled still counts as one, so the split keeps it in the part before.
 */
export function hasOccurrenceBefore(rule: string, series: SeriesTiming, at: Date): boolean {
  return ruleLines(rule).some((line) => {
    if (line.name === 'RRULE') return expanding(line, series).before(wall(series, at)) !== null;
    if (line.name === 'RDATE') {
      return line.value.split(',').some((value) => instantOf(value, line, series) < at.getTime());
    }
    return false;
  });
}

/**
 * A rule's lines, split on \n with blank lines dropped: each line's name and parameter names in
 * upper case (RFC 5545 names are case-insensitive), and its value as written. Throws when a line
 * has no `:`, such as an RRULE written without its `RRULE:` prefix.
 */
function ruleLines(rule: string): RuleLine[] {
  return rule
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(':');
      if (colon === -1) throw new InvalidInputError(`Not a recurrence line: ${line}`);
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

// An RRULE or EXRULE line of the series as an rrule RRule, expanded in wall-clock time (see the
// top of the file): from the series' start date when all-day, else from its start's local time.
function expanding(line: RuleLine, series: SeriesTiming): RRule {
  const dtstart =
    series.allDay && series.startDate ? dateAsUtc(series.startDate) : wall(series, series.startAt);
  return new RRule({ ...RRule.parseString(line.value), dtstart });
}

/**
 * Whether an RRULE or EXRULE line of the series makes an occurrence at `at`.
 *
 * - All-day: whether it makes `at`'s date.
 * - Timed: expand the line within an hour either side of `at`'s local time, turn each occurrence
 *   back into an instant (fromWall), and look for `at` itself. Comparing local times alone would
 *   miss an occurrence a DST change moved: on the night clocks go from 2:00 to 3:00, a 2:30
 *   occurrence is drawn at 3:30, whose local time is not the rule's. And it would accept both
 *   1:30s on the night 1:00 to 2:00 repeats, though the rule makes only the first.
 */
function rruleMakes(line: RuleLine, series: SeriesTiming, at: Date): boolean {
  const rule = expanding(line, series);
  const local = wall(series, at);
  if (series.allDay) return rule.between(local, local, true).length > 0;
  const zone = zoneOf(series);
  return rule
    .between(new Date(local.getTime() - HOUR), new Date(local.getTime() + HOUR), true)
    .some((candidate) => fromWall(candidate, zone).getTime() === at.getTime());
}

// an instant as the series expands it (see the top of the file): its local time in the series'
// zone, or its local date when all-day, written as UTC
function wall(series: SeriesTiming, at: Date): Date {
  return series.allDay ? dateAsUtc(toDateString(at)) : toWall(at, zoneOf(series));
}

// the zone the series expands in: its own, or the system's for one stored without
function zoneOf(series: SeriesTiming): string {
  return series.timeZone ?? localTimeZone();
}

/**
 * The instant an RDATE or EXDATE value names, in ms, so it compares with an occurrence's start:
 *
 * - a UTC DATE-TIME (`…T090000Z`): that instant;
 * - a floating or TZID DATE-TIME (`…T090000`): that local time in the line's TZID, or the series'
 *   zone when it names none, resolved as fromWall does when DST skips or repeats it;
 * - a DATE (`20260615`): the start of that day, in the system zone for an all-day series (where
 *   its occurrences start) and in the series' zone otherwise.
 *
 * rrule cannot do this: its parser reads a UTC and a floating value with the same digits as one.
 */
function instantOf(value: string, line: RuleLine, series: SeriesTiming): number {
  if (value.length === 8) {
    const date = DateTime.fromFormat(value, 'yyyyMMdd', { zone: 'utc' }).toISODate()!;
    return series.allDay
      ? fromDateString(date).getTime()
      : DateTime.fromISO(date, { zone: zoneOf(series) }).toMillis();
  }
  if (value.endsWith('Z')) {
    return DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss'Z'", { zone: 'utc' }).toMillis();
  }
  return DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss", {
    zone: line.params.get('TZID') ?? zoneOf(series),
  }).toMillis();
}

/**
 * How a "following" edit moves the later occurrence rows and cancellations of a timed series,
 * given that it moved the occurrence at `from` to `to`. Each must land on the occurrence of the
 * new series it corresponds to, or a row would be drawn beside the occurrence it replaces, and a
 * cancelled occurrence would come back.
 *
 * The new series repeats `to`'s clock time in `toZone`, its own zone, so the move is made in local
 * time, not by a fixed length:
 *
 * 1. Take the change in local time, from `from`'s in `fromZone` (the old series' zone) to `to`'s
 *    in `toZone`: say 3 days and 0 hours.
 * 2. For each instant moved, add it to the instant's local time in `fromZone`.
 * 3. Turn the result back into an instant in `toZone` (fromWall).
 *
 * Example: a daily 9:00 New York series, moved from Friday 30 October (9:00 EDT) to Monday
 * 2 November (9:00 EST). Its row for Thursday 5 November (9:00 EST) moves to Sunday 8 November
 * at 9:00 EST, where the new series has an occurrence. A fixed length (3 days and 1 hour, across
 * the DST change) would put it at 10:00.
 */
export function shiftByLocalTime(
  from: Date,
  to: Date,
  fromZone: string,
  toZone: string,
): (at: Date) => Date {
  const delta = toWall(to, toZone).getTime() - toWall(from, fromZone).getTime();
  return (at) => fromWall(new Date(toWall(at, fromZone).getTime() + delta), toZone);
}

/**
 * The rule of a series' part before the occurrence at `at`, for a "following" edit or delete: the
 * same rule, ending just before it. Throws for a rule parseRule cannot split.
 *
 * 1. Drop any COUNT: the UNTIL now bounds the series, and RFC 5545 forbids both.
 * 2. Set UNTIL to the last moment before `at`, in the form RFC 5545 requires for the series:
 *    - all-day: the DATE before `at`'s, since the series' DTSTART is a DATE;
 *    - timed: a UTC DATE-TIME one second before `at`, since its DTSTART has a TZID.
 * 3. Write the RRULE line back with its other parts in their order, and the rest of the rule as
 *    it was.
 */
export function ruleEndingBefore(rule: string, series: SeriesTiming, at: Date): string {
  const { lines, index, parts } = parseRule(rule);
  parts.delete('COUNT');
  parts.set('UNTIL', series.allDay ? dayBefore(toDateString(at)) : utcStamp(at.getTime() - 1000));
  lines[index] = formatRRule(parts);
  return lines.join('\n');
}

/**
 * The rule of the new series a "following" edit starts at the occurrence at `at`: the same rule,
 * with as many occurrences left as the old series had from `at` on. Throws for a rule parseRule
 * cannot split.
 *
 * - With a COUNT, lower it by the occurrences before `at` (occurrencesBefore), and throw when none
 *   are left: `at` is past the series' last occurrence.
 * - With an UNTIL, or neither, return the rule unchanged: the new series starts at `at` and ends
 *   where the old one did.
 *
 * Cancelled and excluded occurrences before `at` count towards the COUNT, as RFC 5545 counts a
 * COUNT before EXDATEs are removed.
 */
export function ruleContinuingFrom(rule: string, series: SeriesTiming, at: Date): string {
  const { lines, index, parts } = parseRule(rule);
  const count = parts.get('COUNT');
  if (count !== undefined) {
    const remaining = Number(count) - occurrencesBefore(lines[index], series, at);
    if (remaining <= 0) throw new InvalidInputError('The series has ended before this occurrence');
    parts.set('COUNT', String(remaining));
    lines[index] = formatRRule(parts);
  }
  return lines.join('\n');
}

/**
 * A rule taken apart for splitting: its lines, the index of its RRULE line, and that line's parts
 * by name, in their order. Refuses, with InvalidInputError, a rule that cannot be split: any line
 * but RRULE and EXDATE (an RDATE is not bounded by UNTIL, and an EXRULE would need splitting too),
 * or other than one RRULE.
 */
function parseRule(rule: string) {
  const lines = rule
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const names = lines.map((line) => line.split(/[:;]/, 1)[0].toUpperCase());
  const unsupported = names.find((name) => name !== 'RRULE' && name !== 'EXDATE');
  if (unsupported) {
    throw new InvalidInputError(`A series with ${unsupported} cannot be split`);
  }
  const index = names.indexOf('RRULE');
  if (index === -1 || names.lastIndexOf('RRULE') !== index) {
    throw new InvalidInputError('A series must have exactly one RRULE to be split');
  }
  // the parts in their order, so the rest of the rule is written back as it was
  const parts = new Map<string, string>();
  for (const part of lines[index].slice('RRULE:'.length).split(';')) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) parts.set(key.toUpperCase(), value);
  }
  return { lines, index, parts };
}

// an RRULE line from its parts, as parseRule read them
function formatRRule(parts: Map<string, string>): string {
  return `RRULE:${[...parts].map(([key, value]) => `${key}=${value}`).join(';')}`;
}

/**
 * How many occurrences an RRULE line makes before `at`, for ruleContinuingFrom's COUNT. Counted
 * in wall-clock time (see the top of the file), so it is the same in every system zone and across
 * a DST change.
 */
function occurrencesBefore(rruleLine: string, series: SeriesTiming, at: Date): number {
  const end = wall(series, at);
  return expanding(ruleLines(rruleLine)[0], series).all((date) => date < end).length;
}

const HOUR = 60 * 60 * 1000;

// an instant's local time in a zone, as a Date whose UTC fields are that time: 14:00Z in New York
// in November is 09:00Z
function toWall(at: Date, zone: string): Date {
  return DateTime.fromJSDate(at, { zone }).setZone('utc', { keepLocalTime: true }).toJSDate();
}

// The instant a local time in a zone is, from a Date whose UTC fields are that time: toWall's
// inverse. A time a DST change skips moves forward by the change (2:30 is 3:30); of one it repeats
// (1:30 when 2:00 goes back to 1:00), the first.
function fromWall(local: Date, zone: string): Date {
  return DateTime.fromJSDate(local, { zone: 'utc' })
    .setZone(zone, { keepLocalTime: true })
    .toJSDate();
}

// a YYYY-MM-DD date at 00:00 UTC
function dateAsUtc(date: string): Date {
  return DateTime.fromISO(date, { zone: 'utc' }).toJSDate();
}

// the day before a YYYY-MM-DD date, as an RFC 5545 DATE (YYYYMMDD)
function dayBefore(date: string): string {
  return DateTime.fromISO(date, { zone: 'utc' }).minus({ days: 1 }).toFormat('yyyyMMdd');
}

// an instant as an RFC 5545 UTC DATE-TIME (YYYYMMDDTHHMMSSZ)
function utcStamp(ms: number): string {
  return DateTime.fromMillis(ms, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

// the whole days from one YYYY-MM-DD date to another
export function daysBetween(from: string, to: string): number {
  return DateTime.fromISO(to, { zone: 'utc' }).diff(DateTime.fromISO(from, { zone: 'utc' }), 'days')
    .days;
}

// a YYYY-MM-DD date moved by whole days
export function addDaysToDate(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
}
