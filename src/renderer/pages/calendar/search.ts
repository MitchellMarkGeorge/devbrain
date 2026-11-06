import { z } from 'zod';
import { optional, zPrefixedId } from '../../app/search';

// `/app/calendar`. Which calendars show is not a param: core keeps it per calendar.
export const calendarSearch = z.object({
  // default: settings.calendar.defaultView
  view: optional(z.enum(['week', 'month', 'day'])),
  // the anchor day, default today; the visible range comes from view, date and firstDayOfWeek
  date: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  // the event, or task due, in the sheet
  open: optional(z.union([zPrefixedId('event'), zPrefixedId('task')])),
  // with open=evt_… of a series: which occurrence (its originalStartAt)
  occurrence: optional(z.iso.datetime({ offset: true })),
});

export type CalendarSearch = z.infer<typeof calendarSearch>;
