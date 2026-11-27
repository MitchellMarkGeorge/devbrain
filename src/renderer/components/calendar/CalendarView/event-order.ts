import { TaskStatus } from '@common/types';
import type { CalendarViewEventProps } from './CalendarView';

/**
 * What FullCalendar hands an `eventOrder` function for each item it places: the event's
 * `extendedProps` (CalendarView's hints) beside its own fields, with the start and length in
 * milliseconds and `allDay` as 0 or 1. FullCalendar's types leave it `unknown`; this is the part
 * of it the order reads (its `buildSegCompareObj`).
 */
export interface OrderedItem extends Pick<CalendarViewEventProps, 'kind' | 'status'> {
  start: number;
  duration: number;
  allDay: number;
  title: string;
}

// events, then open tasks, then completed and cancelled ones
function rankOf(item: OrderedItem): number {
  if (item.kind !== 'task') return 0;
  return item.status === TaskStatus.COMPLETED || item.status === TaskStatus.CANCELLED ? 2 : 1;
}

/**
 * The order of the items FullCalendar places together (a day's all-day row, a month cell):
 * FullCalendar's own default (earlier first, then longer first, then timed before all-day), then
 * events before open tasks before closed ones, then by title. So a day's open tasks are not pushed
 * into "+N more" by the ones already done.
 */
export function compareCalendarItems(a: OrderedItem, b: OrderedItem): number {
  return (
    a.start - b.start ||
    b.duration - a.duration ||
    a.allDay - b.allDay ||
    rankOf(a) - rankOf(b) ||
    a.title.localeCompare(b.title)
  );
}

/** `compareCalendarItems` as FullCalendar's `eventOrder` takes it: its items are untyped. */
export const calendarEventOrder = (a: unknown, b: unknown): number =>
  compareCalendarItems(a as OrderedItem, b as OrderedItem);
