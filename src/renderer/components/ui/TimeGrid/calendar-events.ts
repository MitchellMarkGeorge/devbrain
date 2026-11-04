import type { Swatch, TaskStatus } from '../types';

/**
 * An item on the calendar grids, as TimeGrid and MonthGrid take it. Times are local `Date`s;
 * an all-day event runs from the start of its first day to the start of the day after its last
 * (`end` is exclusive), as Google Calendar sends them.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  /** the calendar's colour */
  color?: Swatch;
  /**
   * `event` (default), a `task` scheduled on the grid (its status icon), `focus` time (neutral,
   * dashed) or `out-of-office` (a neutral all-day chip)
   */
  kind?: 'event' | 'task' | 'focus' | 'out-of-office';
  /** a scheduled task's status */
  status?: TaskStatus;
  /** you answered "maybe" */
  tentative?: boolean;
  /** the event has a meeting link */
  meeting?: boolean;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Hours since midnight, with minutes as a fraction: 9:30 → 9.5 */
export function hourOfDay(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** Whole days from `a`'s day to `b`'s day (DST-safe). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

function clock(date: Date): { text: string; meridiem: 'AM' | 'PM' } {
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${String(m).padStart(2, '0')}`, meridiem: h < 12 ? 'AM' : 'PM' };
}

/** "9:30 AM" */
export function formatTime(date: Date): string {
  const c = clock(date);
  return `${c.text} ${c.meridiem}`;
}

/** "1:00 – 2:00 PM", or "11:00 AM – 12:00 PM" across noon */
export function formatTimeRange(start: Date, end: Date): string {
  const a = clock(start);
  const b = clock(end);
  return a.meridiem === b.meridiem
    ? `${a.text} – ${b.text} ${b.meridiem}`
    : `${a.text} ${a.meridiem} – ${b.text} ${b.meridiem}`;
}

/** An hour label for the grid's gutter: 8 → "8 AM", 12 → "12 PM", 24 → "12 AM" */
export function formatHour(hour: number): string {
  const h = hour % 24;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Lays out one day's timed events side by side where they overlap: each event gets a `lane` and
 * the number of `lanes` in its cluster of overlapping events.
 */
export function layoutOverlaps<T extends { start: Date; end: Date }>(
  events: T[],
): { event: T; lane: number; lanes: number }[] {
  const sorted = [...events].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      b.end.getTime() - b.start.getTime() - (a.end.getTime() - a.start.getTime()),
  );
  const out: { event: T; lane: number; lanes: number }[] = [];
  let cluster: { event: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const close = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const event of sorted) {
    const start = event.start.getTime();
    const end = event.end.getTime();
    if (cluster.length > 0 && start >= clusterEnd) close();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = end;
    clusterEnd = cluster.length > 0 ? Math.max(clusterEnd, end) : end;
    cluster.push({ event, lane, lanes: 0 });
  }
  close();
  return out;
}

/**
 * Stacks all-day events spanning `days` columns into rows (lanes) so none overlap. `first` and
 * `last` are column indexes, clamped to the range shown.
 */
export function layoutAllDay<T extends CalendarEvent>(
  events: T[],
  rangeStart: Date,
  columns: number,
): { event: T; first: number; last: number; lane: number }[] {
  const placed = events
    .map((event) => {
      const first = Math.max(0, dayDiff(rangeStart, event.start));
      // `end` is exclusive: an event ending at midnight ends on the day before
      const endDay =
        event.end.getTime() > event.start.getTime()
          ? new Date(event.end.getTime() - 1)
          : event.start;
      const last = Math.min(columns - 1, dayDiff(rangeStart, endDay));
      return { event, first, last, lane: 0 };
    })
    .filter((p) => p.last >= 0 && p.first <= columns - 1 && p.first <= p.last)
    .sort((a, b) => a.first - b.first || b.last - b.first - (a.last - a.first));
  const laneEnds: number[] = [];
  for (const p of placed) {
    let lane = laneEnds.findIndex((end) => end < p.first);
    if (lane === -1) lane = laneEnds.push(-1) - 1;
    laneEnds[lane] = p.last;
    p.lane = lane;
  }
  return placed;
}
