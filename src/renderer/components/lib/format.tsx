import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DateTime } from 'luxon';
import type { AppSettings } from '@common/types';

/** 12 or 24 hour clocks, as the General settings choose. */
export type TimeFormat = AppSettings['general']['timeFormat'];

/** What `useFormat()` returns: the current minute, and luxon's formats on it. */
export interface Format {
  /** the current time, to the minute; it changes once a minute, so relative dates count down */
  now: Date;
  timeFormat: TimeFormat;
  /**
   * A due date: "Today", "Tomorrow", "Yesterday", "In 3 days" or "2 days ago" within a week of
   * today (luxon's `toRelativeCalendar`), else "Jul 1".
   */
  formatDue: (date: Date) => string;
  /** How long ago or until: "2 hr. ago", "In 12 min." (luxon's `toRelative`, narrow style) */
  formatRelative: (date: Date) => string;
  /** A time of day in the time format: "9:30 AM" or "09:30" */
  formatTime: (date: Date) => string;
  /** A short date: "Jul 1" */
  formatDate: (date: Date) => string;
}

// luxon's relative words start lower case ("today", "in 3 days"); the components show them first
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
      return capitalize(DateTime.fromJSDate(date).toRelative({ base, style: 'narrow' }) ?? '');
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

const FormatContext = createContext<Format | null>(null);

// the current time at the start of its minute
function thisMinute(): Date {
  const at = new Date();
  at.setSeconds(0, 0);
  return at;
}

/** The current minute, changing at the start of each minute. */
function useMinuteClock(enabled: boolean): Date {
  const [now, setNow] = useState(thisMinute);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(thisMinute());
          schedule();
        },
        60_000 - (Date.now() % 60_000),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [enabled]);
  return now;
}

export interface FormatProviderProps {
  /** a fixed time, for stories and tests; without it `now` ticks once a minute */
  now?: Date;
  /** from `settings.general.timeFormat`; 12 hour by default */
  timeFormat?: TimeFormat;
  children: ReactNode;
}

/**
 * Supplies `now` and the date formats to every entity component below it. The app mounts it once
 * in `/app` with the time format from settings; Storybook mounts it with a fixed `now`.
 */
export function FormatProvider({
  now: fixedNow,
  timeFormat = '12',
  children,
}: FormatProviderProps) {
  const ticking = useMinuteClock(fixedNow == null);
  const now = fixedNow ?? ticking;
  const time = now.getTime();
  const value = useMemo(() => createFormat(new Date(time), timeFormat), [time, timeFormat]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

/**
 * The current minute and the date formats, from the nearest `FormatProvider`. Outside one it
 * formats against the time of the first render, in 12 hour time, and does not tick.
 */
export function useFormat(): Format {
  const context = useContext(FormatContext);
  const [fallback] = useState(() => (context ? null : createFormat(thisMinute())));
  return context ?? fallback ?? createFormat(thisMinute());
}

/** A due date as a phrase: "Due today", "Due in 3 days", "Due Jul 1" */
export function dueText(date: Date, format: Pick<Format, 'formatDue'>): string {
  const text = format.formatDue(date);
  return /^[A-Z][a-z]/.test(text) && !/^[A-Z][a-z]{2} \d/.test(text)
    ? `Due ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : `Due ${text}`;
}
