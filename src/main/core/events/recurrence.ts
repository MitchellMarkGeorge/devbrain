import { DateTime } from 'luxon';
import { RRule } from 'rrule';
import { InvalidInputError } from '../shared/errors';
import { fromDateString, localTimeZone, toDateString } from '../shared/dates';

// Splitting a series' rule in two at one of its occurrences, for "this and following" edits and
// deletes: the part before the split ends just before it, and the part after starts there.
//
// A rule is RFC 5545 lines joined with \n (see Event.recurrenceRule). Splitting supports one RRULE
// with any EXDATE lines. RDATE and EXRULE are refused: an RDATE is not bounded by UNTIL, so the
// part before would keep any after the split.

interface SeriesTiming {
  startAt: Date;
  allDay: boolean;
  startDate: string | null;
  timeZone: string | null;
}

// the lines a local series' rule may have
const LINE_NAMES = new Set(['RRULE', 'EXRULE', 'RDATE', 'EXDATE']);
// an RDATE or EXDATE value: a DATE, a floating or TZID DATE-TIME, or a UTC one
const DATE_VALUE = /^\d{8}(T\d{6}Z?)?$/;

interface RuleLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

/**
 * Refuses a rule FullCalendar could not expand, or occurrence edits could not read: RRULE,
 * EXRULE, RDATE and EXDATE lines only (DTSTART comes from the event's start), at least one RRULE,
 * and every RRULE and EXRULE one rrule can expand. Returns the rule as it was.
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
 * Whether the series has an occurrence starting at `at`, as FullCalendar expands it: one an RRULE
 * or RDATE line makes and no EXRULE or EXDATE line removes. The series' cancelled occurrences
 * and occurrence rows are not consulted. An all-day occurrence starts at the start of its day.
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

// whether an RRULE or RDATE line of the series makes an occurrence before `at`
export function hasOccurrenceBefore(rule: string, series: SeriesTiming, at: Date): boolean {
  return ruleLines(rule).some((line) => {
    if (line.name === 'RRULE') return expanding(line, series).before(wall(series, at)) !== null;
    if (line.name === 'RDATE') {
      return line.value.split(',').some((value) => instantOf(value, line, series) < at.getTime());
    }
    return false;
  });
}

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

// an RRULE or EXRULE line of the series, expanded in its wall-clock time (see occurrencesBefore)
function expanding(line: RuleLine, series: SeriesTiming): RRule {
  const dtstart =
    series.allDay && series.startDate ? dateAsUtc(series.startDate) : wall(series, series.startAt);
  return new RRule({ ...RRule.parseString(line.value), dtstart });
}

// whether an RRULE or EXRULE line of the series makes an occurrence at `at`
function rruleMakes(line: RuleLine, series: SeriesTiming, at: Date): boolean {
  const rule = expanding(line, series);
  const local = wall(series, at);
  if (series.allDay) return rule.between(local, local, true).length > 0;
  // A local time a DST change skips (2:30 when clocks go from 2:00 to 3:00) happens an hour
  // later, so the candidates are those near `at`, each compared as the instant it is.
  const zone = zoneOf(series);
  return rule
    .between(new Date(local.getTime() - HOUR), new Date(local.getTime() + HOUR), true)
    .some((candidate) => fromWall(candidate, zone).getTime() === at.getTime());
}

// an instant as the series expands it: its local time in the series' zone, or its date when
// all-day, written as UTC
function wall(series: SeriesTiming, at: Date): Date {
  return series.allDay ? dateAsUtc(toDateString(at)) : toWall(at, zoneOf(series));
}

function zoneOf(series: SeriesTiming): string {
  return series.timeZone ?? localTimeZone();
}

// The instant an RDATE or EXDATE value names, in ms: a UTC DATE-TIME as it is, a floating or TZID
// one in its zone (the series' when it names none), and a DATE at the start of its day.
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
 * Moves instants as an edit moved one occurrence of a series from `from` to `to`, by the change in
 * local time: the same days and clock time later, so an occurrence 9:00 before a DST change is
 * 9:00 after it, as the series it moves to expands. `toZone` is that series' zone.
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

// the rule of the part before `at`: the same, ending just before it
export function ruleEndingBefore(rule: string, series: SeriesTiming, at: Date): string {
  const { lines, index, parts } = parseRule(rule);
  parts.delete('COUNT');
  parts.set('UNTIL', series.allDay ? dayBefore(toDateString(at)) : utcStamp(at.getTime() - 1000));
  lines[index] = formatRRule(parts);
  return lines.join('\n');
}

// The rule of the part from `at` on. A COUNT is lowered by the occurrences before `at`; an UNTIL
// is kept. Throws when `at` is past the series' last occurrence.
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

function formatRRule(parts: Map<string, string>): string {
  return `RRULE:${[...parts].map(([key, value]) => `${key}=${value}`).join(';')}`;
}

/**
 * How many occurrences the RRULE has before `at`. Expanded in wall-clock time: the series' start
 * and `at` as the local times of its zone (all-day: its dates), written as UTC, so rrule never
 * converts zones and a 9:00 occurrence stays 9:00 across DST.
 */
function occurrencesBefore(rruleLine: string, series: SeriesTiming, at: Date): number {
  const end = wall(series, at);
  return expanding(ruleLines(rruleLine)[0], series).all((date) => date < end).length;
}

const HOUR = 60 * 60 * 1000;

// an instant's local time in a zone, as a Date whose UTC fields are that time
function toWall(at: Date, zone: string): Date {
  return DateTime.fromJSDate(at, { zone }).setZone('utc', { keepLocalTime: true }).toJSDate();
}

// The instant a local time in a zone is, from a Date whose UTC fields are that time. A time a DST
// change skips moves forward by the change; one it repeats is the first of the two.
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
