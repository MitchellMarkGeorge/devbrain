// Time formatting shared by the calendar components, and the CalendarEvent shape the stories and
// screens describe events in (CalendarView's calendarEventInput maps it to FullCalendar input).
export type { CalendarEvent } from '../types';

/** The clock the times are written in: `'12'` (9:30 AM) or `'24'` (09:30), as the setting. */
export type TimeFormat = '12' | '24';

const pad = (value: number) => String(value).padStart(2, '0');

function clock(date: Date): { text: string; meridiem: 'AM' | 'PM' } {
  const h = date.getHours();
  const m = date.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${pad(m)}`, meridiem: h < 12 ? 'AM' : 'PM' };
}

// "09:30"
function clock24(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "9:30 AM", or "09:30" on the 24-hour clock */
export function formatTime(date: Date, timeFormat: TimeFormat = '12'): string {
  if (timeFormat === '24') return clock24(date);
  const c = clock(date);
  return `${c.text} ${c.meridiem}`;
}

/** "9:30", or "09:30" on the 24-hour clock: the month grid's short start time */
export function formatShortTime(date: Date, timeFormat: TimeFormat = '12'): string {
  return timeFormat === '24' ? clock24(date) : clock(date).text;
}

/**
 * "1:00 – 2:00 PM", or "11:00 AM – 12:00 PM" across noon; "13:00 – 14:00" on the 24-hour clock
 */
export function formatTimeRange(start: Date, end: Date, timeFormat: TimeFormat = '12'): string {
  if (timeFormat === '24') return `${clock24(start)} – ${clock24(end)}`;
  const a = clock(start);
  const b = clock(end);
  return a.meridiem === b.meridiem
    ? `${a.text} – ${b.text} ${b.meridiem}`
    : `${a.text} ${a.meridiem} – ${b.text} ${b.meridiem}`;
}

/**
 * An hour label for the grid's gutter: 8 → "8 AM", 12 → "12 PM", 24 → "12 AM"; "08:00" on the
 * 24-hour clock
 */
export function formatHour(hour: number, timeFormat: TimeFormat = '12'): string {
  const h = hour % 24;
  if (timeFormat === '24') return `${pad(h)}:00`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? 'AM' : 'PM'}`;
}
