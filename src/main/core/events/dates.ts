import { z } from 'zod';

// Dates without a time, as all-day events use them: "YYYY-MM-DD", read and written in the app's own
// zone. A date's instant is its local midnight, so a local-day filter matches it.

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

// a date's local midnight
export function fromDateString(date: string): Date {
  if (!isDateString(date)) throw new Error(`Not a date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// the dates of an all-day event given as instants: the day it starts, and the day after the last
// day it touches (an end at midnight touches only the day before). Never shorter than one day.
export function allDayDates(startAt: Date, endAt: Date): { startDate: string; endDate: string } {
  const startDate = toDateString(startAt);
  const lastDay = new Date(Math.max(endAt.getTime() - 1, startAt.getTime()));
  return { startDate, endDate: toDateString(addDays(fromDateString(toDateString(lastDay)), 1)) };
}

// the app's own zone, which a local event is created in
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function addDays(at: Date, days: number): Date {
  const next = new Date(at);
  next.setDate(next.getDate() + days);
  return next;
}
