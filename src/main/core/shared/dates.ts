import { z } from 'zod';

// Time zone policy: DevBrain uses the system time zone, and only that. There is no time zone
// setting. Every local-day calculation in core uses the process's own zone (Date's local
// methods), which in the app is the zone the OS reports, the same one the renderer's Dates and
// FullCalendar's default `timeZone: 'local'` use. So core and the UI always agree on what "today"
// is without passing a zone around.
//
// - A date without a time ("YYYY-MM-DD", as all-day events and day filters use) means a day in the
//   system zone. Its instant is the start of that day: local midnight, or the first moment of the
//   day where a DST change skips midnight (e.g. America/Santiago).
// - A day range runs from the start of a day to the start of the next one, so it lasts 23 or 25
//   hours across a DST change.
// - Stored dates (startDate/endDate) are what an all-day event means; their instants are derived
//   for range queries. Should the system zone change (travel), the dates still name the same days.
// - An event's own `timeZone` (an IANA name) is a separate thing: the zone a series expands in, so
//   a 9:00 standup stays at 9:00 across DST. It defaults to the system zone and is validated with
//   `timeZoneSchema`.
//
// Tests run these helpers under several TZ values (tests/shared/dates.test.ts).

const dateSchema = z.iso.date();

// a real date as YYYY-MM-DD: a month or day out of range, such as 2026-02-30, is not one
export function isDateString(value: string): boolean {
  return dateSchema.safeParse(value).success;
}

// the local day an instant falls on
export function toDateString(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// the start of a date's local day
export function fromDateString(date: string): Date {
  if (!isDateString(date)) throw new Error(`Not a date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// The local day an instant falls on, as [startOfDay, endOfDay): the start of that day and the start
// of the next. Not always 24 hours apart: a DST change makes the day 23 or 25 hours long.
export function localDayWindow(date: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startOfDay, endOfDay };
}

// the dates of an all-day event given as instants: the day it starts, and the day after the last
// day it touches (an end at the start of a day touches only the day before). Never shorter than
// one day.
export function allDayDates(startAt: Date, endAt: Date): { startDate: string; endDate: string } {
  const startDate = toDateString(startAt);
  const lastDay = new Date(Math.max(endAt.getTime() - 1, startAt.getTime()));
  return { startDate, endDate: toDateString(addDays(fromDateString(toDateString(lastDay)), 1)) };
}

// the system zone as an IANA name, which a local event is created in
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// An IANA zone name, such as "America/Toronto" or "UTC". Intl accepts offsets ("+05:00") as zones
// too, but those have no DST rules, so they are refused.
export const timeZoneSchema = z
  .string()
  .refine((value) => /^[A-Za-z]/.test(value) && isKnownTimeZone(value), {
    message: 'Not an IANA time zone',
  });

export function isTimeZone(value: string): boolean {
  return timeZoneSchema.safeParse(value).success;
}

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function addDays(at: Date, days: number): Date {
  const next = new Date(at);
  next.setDate(next.getDate() + days);
  return next;
}
