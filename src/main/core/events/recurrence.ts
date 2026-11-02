import { RRule } from 'rrule';
import { InvalidInputError } from '../shared/errors';
import { localTimeZone, toDateString } from '../shared/dates';

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
  const wall = (instant: Date) =>
    series.allDay
      ? dateAsUtc(toDateString(instant))
      : wallClock(instant, series.timeZone ?? localTimeZone());
  const dtstart =
    series.allDay && series.startDate ? dateAsUtc(series.startDate) : wall(series.startAt);
  const end = wall(at);
  const options = RRule.parseString(rruleLine.slice('RRULE:'.length));
  return new RRule({ ...options, dtstart }).all((date) => date < end).length;
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
