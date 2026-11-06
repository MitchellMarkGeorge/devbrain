import type { EventInput, EventSourceFuncInfo, EventSourceInput } from '@fullcalendar/react';
import { hexColorSchema } from '@common/color';
import {
  EventKind,
  EventResponse,
  EventStatus,
  type Calendar,
  type Event,
  type ExternalRef,
} from '@common/types';
import type { EventId } from '@common/ids';
import type { CalendarViewEventProps } from '../components/calendar/CalendarView';
import { daysBetween, isExpandable, rruleString, seriesRule } from './recurrence';

// Core's events as FullCalendar event input, per docs/calendar/fullcalendar-adapter.md.

/** What `toEventInput` puts in `extendedProps`: CalendarView's display hints and what a click needs. */
export interface EventInputProps extends CalendarViewEventProps {
  calendarId: Event['calendarId'];
  /** the provider item a synced event mirrors (open its `url` with `workspace.openUrl`) */
  external: ExternalRef | null;
  /** an occurrence row's series, and the start it had in it; null otherwise */
  seriesId: EventId | null;
  originalStartAt: Date | null;
  response: EventResponse | null;
  /** the event is a series master: a click's start is the expanded occurrence's */
  recurring: boolean;
}

/**
 * One event `listForCalendar` returned, as FullCalendar input:
 *
 * - a timed one-off or occurrence row: `start`/`end` instants, `groupId` its series;
 * - an all-day one-off: `start`/`end` dates passed through as text, the end exclusive;
 * - a series master: `rrule` (see recurrence.ts) and `duration`, `groupId` itself; one whose rule
 *   rrule cannot read is drawn as its first occurrence, a one-off.
 *
 * `color` is set only when the event's own colour (a valid `#rrggbb`) differs from the
 * calendar's, which colours its source. `editable` is false for a synced event and otherwise
 * left to the calendar. Display hints go in `extendedProps`, for CalendarView.
 *
 * A property with no value is left out rather than set to `undefined`: FullCalendar refines
 * every key present, so `groupId: undefined` would become the group "undefined" shared by every
 * one-off event, and `color: undefined` the colour "undefined".
 */
export function toEventInput(event: Event, calendar: Calendar): EventInput {
  const own = parseColor(event.color);
  const input: EventInput = {
    id: event.id,
    title: event.title,
    allDay: event.allDay,
    extendedProps: eventProps(event),
  };
  if (own && own !== parseColor(calendar.color)) input.color = own;
  if (event.external) input.editable = false;

  const rule = event.recurrenceRule ? seriesRule(event) : null;
  const rrule = rule && rruleString(rule);
  if (rule && rrule && isExpandable(rrule)) {
    input.groupId = event.id;
    input.rrule = rrule;
    input.duration = rule.allDay
      ? { days: Math.max(1, daysBetween(event.startDate!, event.endDate ?? event.startDate!)) }
      : { milliseconds: event.endAt.getTime() - event.startAt.getTime() };
    return input;
  }
  if (event.seriesId) input.groupId = event.seriesId;
  if (event.allDay && event.startDate) {
    input.start = event.startDate;
    if (event.endDate) input.end = event.endDate;
  } else {
    input.start = event.startAt;
    input.end = event.endAt;
  }
  return input;
}

/**
 * A calendar as a FullCalendar event source, coloured by the calendar (a theme colour when its
 * colour is not a valid `#rrggbb`). `load` fetches the range's events, normally
 * `listForCalendar(start, end, { calendarIds: [calendar.id] })`.
 */
export function toEventSource(
  calendar: Calendar,
  load: (range: { start: Date; end: Date }) => Promise<Event[]>,
): EventSourceInput {
  const color = parseColor(calendar.color);
  return {
    id: calendar.id,
    ...(color && { color }),
    events: async (info: EventSourceFuncInfo) => {
      const events = await load({ start: info.start, end: info.end });
      return events.map((event) => toEventInput(event, calendar));
    },
  };
}

function eventProps(event: Event): EventInputProps {
  const kind =
    event.kind === EventKind.FOCUS_TIME
      ? 'focus'
      : event.kind === EventKind.OUT_OF_OFFICE
        ? 'out-of-office'
        : 'event';
  return {
    kind,
    tentative: event.status === EventStatus.TENTATIVE || event.response === EventResponse.TENTATIVE,
    declined: event.response === EventResponse.DECLINED,
    meeting: event.meetingUrl != null,
    calendarId: event.calendarId,
    external: event.external ?? null,
    seriesId: event.seriesId,
    originalStartAt: event.originalStartAt,
    response: event.response,
    recurring: event.recurrenceRule != null,
  };
}

// a colour safe to put in a style, or undefined (docs/security/untrusted-content.md)
function parseColor(color: string | null): string | undefined {
  const parsed = hexColorSchema.safeParse(color);
  return parsed.success ? parsed.data.toLowerCase() : undefined;
}
