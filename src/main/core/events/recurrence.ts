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
      ? expanding(line, series).between(wall(series, at), wall(series, at), true).length > 0
      : line.value.split(',').some((value) => value === stampFor(value, line, series, at));
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
      return line.value.split(',').some((value) => value < stampFor(value, line, series, at));
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

// an instant as the series expands it: its local time in the series' zone, or its date when
// all-day, written as UTC
function wall(series: SeriesTiming, at: Date): Date {
  return series.allDay
    ? dateAsUtc(toDateString(at))
    : wallClock(at, series.timeZone ?? localTimeZone());
}

// `at` written the way an RDATE or EXDATE value is, so the two compare as strings
function stampFor(value: string, line: RuleLine, series: SeriesTiming, at: Date): string {
  if (value.endsWith('Z')) return utcStamp(at.getTime());
  const local = series.allDay
    ? dateAsUtc(toDateString(at))
    : wallClock(at, line.params.get('TZID') ?? series.timeZone ?? localTimeZone());
  return local.toISOString().replace(/[-:]/g, '').slice(0, value.length);
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

// an instant's local time in a zone, as a Date whose UTC fields are that time
function wallClock(at: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)!.value);
  return new Date(
    Date.UTC(
      field('year'),
      field('month') - 1,
      field('day'),
      field('hour'),
      field('minute'),
      field('second'),
    ),
  );
}

// a YYYY-MM-DD date at 00:00 UTC
function dateAsUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// the day before a YYYY-MM-DD date, as an RFC 5545 DATE (YYYYMMDD)
function dayBefore(date: string): string {
  const previous = new Date(dateAsUtc(date).getTime() - 24 * 60 * 60 * 1000);
  return previous.toISOString().slice(0, 10).replaceAll('-', '');
}

// an instant as an RFC 5545 UTC DATE-TIME (YYYYMMDDTHHMMSSZ)
function utcStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// the whole days from one YYYY-MM-DD date to another
export function daysBetween(from: string, to: string): number {
  return Math.round((dateAsUtc(to).getTime() - dateAsUtc(from).getTime()) / (24 * 60 * 60 * 1000));
}

// a YYYY-MM-DD date moved by whole days
export function addDaysToDate(date: string, days: number): string {
  return new Date(dateAsUtc(date).getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
