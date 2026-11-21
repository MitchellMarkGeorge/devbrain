import { DateTime } from 'luxon';

// The calendar's `date` search param, written as one: every link or navigation to a day of the
// calendar (the page's own steps, an event opened from elsewhere) formats it here.

/** A day as the calendar's `date` param writes it: `YYYY-MM-DD`, in local time. */
export function dateParam(date: Date): string {
  return DateTime.fromJSDate(date).toISODate()!;
}
