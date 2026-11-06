import type { Event } from '@common/types';
import type { Format } from './lib/format';

/**
 * How the event components word an event's time and repeat rule, from core's `Event` fields and
 * the formats of `useFormat()`.
 */

/** "10:00 AM – 10:30 AM", or "All day" */
export function eventTimeRange(
  event: Pick<Event, 'startAt' | 'endAt' | 'allDay'>,
  format: Pick<Format, 'formatTime'>,
): string {
  if (event.allDay) return 'All day';
  return `${format.formatTime(event.startAt)} – ${format.formatTime(event.endAt)}`;
}

const WEEKDAYS: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const UNITS: Record<string, [one: string, adverb: string]> = {
  DAILY: ['day', 'Daily'],
  WEEKLY: ['week', 'Weekly'],
  MONTHLY: ['month', 'Monthly'],
  YEARLY: ['year', 'Yearly'],
};

/** The parts of an `RRULE:` line: `{ FREQ: 'WEEKLY', BYDAY: 'TU' }` */
function ruleParts(recurrenceRule: string): Record<string, string> | undefined {
  const line = recurrenceRule
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('RRULE:'));
  if (!line) return undefined;
  return Object.fromEntries(
    line
      .slice('RRULE:'.length)
      .split(';')
      .map((part) => part.split('=') as [string, string]),
  );
}

/**
 * How a series repeats, from its `recurrenceRule`: `short` ("Weekly", "Every 2 weeks") for rows,
 * or `long` ("Every week on Tuesday") for a hover card. Undefined for a one-off, or a rule it
 * cannot word (with no FREQ, or a FREQ finer than a day).
 */
export function repeatLabel(
  recurrenceRule: string | null | undefined,
  length: 'short' | 'long' = 'short',
): string | undefined {
  const parts = recurrenceRule ? ruleParts(recurrenceRule) : undefined;
  const unit = parts && UNITS[parts.FREQ];
  if (!parts || !unit) return undefined;
  const interval = Number(parts.INTERVAL ?? 1) || 1;
  const weekdays =
    parts.FREQ === 'WEEKLY' &&
    interval === 1 &&
    parts.BYDAY?.split(',').sort().join() === 'FR,MO,TH,TU,WE';
  if (weekdays) return length === 'short' ? 'Weekdays' : 'Every weekday';
  if (length === 'short') return interval === 1 ? unit[1] : `Every ${interval} ${unit[0]}s`;
  const every = interval === 1 ? `Every ${unit[0]}` : `Every ${interval} ${unit[0]}s`;
  const days = parts.FREQ === 'WEEKLY' && parts.BYDAY ? parts.BYDAY.split(',') : [];
  const names = days.map((day) => WEEKDAYS[day.replace(/^[+-]?\d+/, '')]).filter(Boolean);
  if (names.length === 0) return every;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${every} on ${list}`;
}

/**
 * How soon an event is, for a list row: "Now" while it runs, the time until it starts ("In 12 min.")
 * or since it started ("2 hr. ago"), with the tone that colours it: `soon` (red) from an hour before
 * the start until the end, `today` later today.
 */
export function eventCountdown(
  event: Pick<Event, 'startAt' | 'endAt' | 'allDay'>,
  format: Pick<Format, 'now' | 'formatRelative'>,
): { text: string; tone?: 'soon' | 'today' } {
  const { now } = format;
  const start = event.startAt.getTime();
  const end = event.endAt.getTime();
  const at = now.getTime();
  if (event.allDay) {
    return at >= start && at < end
      ? { text: 'Today', tone: 'today' }
      : { text: format.formatRelative(event.startAt) };
  }
  if (at >= start && at < end) return { text: 'Now', tone: 'soon' };
  const text = format.formatRelative(event.startAt);
  if (start > at && start - at <= 60 * 60_000) return { text, tone: 'soon' };
  const sameDay =
    event.startAt.getFullYear() === now.getFullYear() &&
    event.startAt.getMonth() === now.getMonth() &&
    event.startAt.getDate() === now.getDate();
  return { text, tone: start > at && sameDay ? 'today' : undefined };
}
