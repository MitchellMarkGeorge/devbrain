import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { DateTime } from 'luxon';
import type { AppSettings } from '@common/types';

/** 12 or 24 hour clocks, as the General settings choose. */
export type TimeFormat = AppSettings['general']['timeFormat'];

/** What `useFormat()` returns: the current minute, and the formats on it (luxon, and Intl for relative times). */
export interface Format {
  /**
   * the current time at the precision `useFormat` was asked for: the start of today, or of the
   * current minute
   */
  now: Date;
  timeFormat: TimeFormat;
  /**
   * A due date: "Today", "Tomorrow", "Yesterday", "In 3 days" or "2 days ago" within a week of
   * today (luxon's `toRelativeCalendar`), else "Jul 1".
   */
  formatDue: (date: Date) => string;
  /**
   * How long ago or until, in the largest whole unit: "2h ago", "In 12m", "Yesterday", "Now"
   * (`Intl.RelativeTimeFormat`, narrow style)
   */
  formatRelative: (date: Date) => string;
  /** A time of day in the time format: "9:30 AM" or "09:30" */
  formatTime: (date: Date) => string;
  /** A short date: "Jul 1" */
  formatDate: (date: Date) => string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// the largest unit a span reads in, and how long one is
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY],
  ['month', 30 * DAY],
  ['week', 7 * DAY],
  ['day', DAY],
  ['hour', HOUR],
  ['minute', MINUTE],
];

// narrow numbers ("2h ago", "in 12m"), and words where a language has them for a day either side
// and for now ("yesterday", "tomorrow", "now"); `auto` for every unit would give "last yr."
const numeric = new Intl.RelativeTimeFormat(undefined, { style: 'narrow', numeric: 'always' });
const worded = new Intl.RelativeTimeFormat(undefined, { style: 'narrow', numeric: 'auto' });

/** A span of `ms` (negative for the past) in its largest whole unit: "2h ago", "in 12m", "now". */
export function relativeTime(ms: number): string {
  for (const [unit, size] of UNITS) {
    const count = Math.trunc(ms / size);
    if (count !== 0)
      return (unit === 'day' && Math.abs(count) === 1 ? worded : numeric).format(count, unit);
  }
  return worded.format(0, 'second');
}

// luxon's and Intl's relative words start lower case ("today", "in 3 days"); the components show them first
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The formats on a fixed `now`, as `FormatProvider` supplies them. */
export function createFormat(now: Date, timeFormat: TimeFormat = '12'): Format {
  const base = DateTime.fromJSDate(now);
  const today = base.startOf('day');
  const formatDate = (date: Date) =>
    DateTime.fromJSDate(date).toLocaleString({ month: 'short', day: 'numeric' });
  return {
    now,
    timeFormat,
    formatDue(date) {
      const day = DateTime.fromJSDate(date).startOf('day');
      if (Math.abs(day.diff(today, 'days').days) < 7) {
        return capitalize(day.toRelativeCalendar({ base: today, unit: 'days' }) ?? '');
      }
      return formatDate(date);
    },
    formatRelative(date) {
      return capitalize(relativeTime(date.getTime() - now.getTime()));
    },
    formatTime(date) {
      return DateTime.fromJSDate(date).toLocaleString({
        ...DateTime.TIME_SIMPLE,
        hourCycle: timeFormat === '24' ? 'h23' : 'h12',
      });
    },
    formatDate,
  };
}

/** How often a component needs `now` to move: its words change daily, or by the minute. */
export type Precision = 'day' | 'minute';

/** The current time, ticking at the start of each minute; or fixed, for stories and tests. */
export interface Clock {
  subscribe: (listener: () => void) => () => void;
  /** milliseconds since the epoch, at the start of the current minute */
  now: () => number;
}

const startOfMinute = (ms: number) => ms - (ms % MINUTE);
const startOfDay = (ms: number) => {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
};

/**
 * A clock that ticks at the start of each minute while something listens to it: one timer for
 * everything below the provider, and none while nothing shows a time that moves.
 */
export function createMinuteClock(): Clock {
  const listeners = new Set<() => void>();
  let current = startOfMinute(Date.now());
  let timer: ReturnType<typeof setTimeout> | undefined;
  // the next minute's start; after sleep the timer fires late, and that tick catches up
  const schedule = () => {
    timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
  };
  const tick = () => {
    current = startOfMinute(Date.now());
    listeners.forEach((listener) => listener());
    schedule();
  };
  return {
    now: () => current,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        current = startOfMinute(Date.now());
        schedule();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) clearTimeout(timer);
      };
    },
  };
}

/** A clock stopped at `at` (to its minute). */
export function fixedClock(at: Date): Clock {
  const ms = startOfMinute(at.getTime());
  return { now: () => ms, subscribe: () => () => {} };
}

interface FormatContextValue {
  clock: Clock;
  timeFormat: TimeFormat;
}

const FormatContext = createContext<FormatContextValue | null>(null);

export interface FormatProviderProps {
  /** a fixed time, for stories and tests; without it `now` ticks once a minute */
  now?: Date;
  /** from `settings.general.timeFormat`; 12 hour by default */
  timeFormat?: TimeFormat;
  children: ReactNode;
}

/**
 * Supplies the clock and the time format to every entity component below it. The app mounts it
 * once, with the time format from settings; Storybook mounts it with a
 * fixed `now`. Its value only changes with the time format: the clock reaches components through
 * `useFormat(precision)`, so each re-renders only when `now` moves at the precision it reads.
 */
export function FormatProvider({
  now: fixedNow,
  timeFormat = '12',
  children,
}: FormatProviderProps) {
  const fixed = fixedNow?.getTime();
  const clock = useMemo(
    () => (fixed == null ? createMinuteClock() : fixedClock(new Date(fixed))),
    [fixed],
  );
  const value = useMemo(() => ({ clock, timeFormat }), [clock, timeFormat]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

/**
 * The date formats against `now` at a precision, from the nearest `FormatProvider`. The component
 * re-renders only when `now` moves at that precision:
 *
 * - `'day'` (the default): at midnight. For due dates, overdue, "Done Jun 12" and times of day.
 *   `now` is the start of today, so `formatRelative` is not for it.
 * - `'minute'`: at the start of each minute. For relative times ("2h ago", "In 12m") and event
 *   countdowns.
 *
 * Outside a provider it formats against the time of its first render, in 12 hour time, and does
 * not tick.
 */
export function useFormat(precision: Precision = 'day'): Format {
  const context = useContext(FormatContext);
  const [fallback] = useState<FormatContextValue>(() => ({
    clock: fixedClock(new Date()),
    timeFormat: '12',
  }));
  const { clock, timeFormat } = context ?? fallback;
  const round = precision === 'day' ? startOfDay : startOfMinute;
  // a number, so React's Object.is check skips the re-render while it is unchanged
  const now = useSyncExternalStore(clock.subscribe, () => round(clock.now()));
  return useMemo(() => createFormat(new Date(now), timeFormat), [now, timeFormat]);
}

/** A due date as a phrase: "Due today", "Due in 3 days", "Due Jul 1" */
export function dueText(date: Date, format: Pick<Format, 'formatDue'>): string {
  const text = format.formatDue(date);
  return /^[A-Z][a-z]/.test(text) && !/^[A-Z][a-z]{2} \d/.test(text)
    ? `Due ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : `Due ${text}`;
}
