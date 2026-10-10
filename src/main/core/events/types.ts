import { CalendarId, EventId } from '@common/ids';
import { Model } from '../shared/model';
import type { ExternalRef } from '../integrations/types';

// string values, as they are stored in the events table's text columns

export enum EventStatus {
  CONFIRMED = 'confirmed',
  TENTATIVE = 'tentative',
}

// what kind of time an event is, which the calendar draws differently
export enum EventKind {
  DEFAULT = 'default',
  FOCUS_TIME = 'focus_time',
  OUT_OF_OFFICE = 'out_of_office',
}

// the calendar's own answer to an invitation
export enum EventResponse {
  NEEDS_ACTION = 'needs_action',
  ACCEPTED = 'accepted',
  TENTATIVE = 'tentative',
  DECLINED = 'declined',
}

/**
 * An event, shaped so the calendar view can hand it to FullCalendar with little translation:
 *
 * - A timed event is the instants startAt and endAt.
 * - An all-day event is the dates startDate and endDate (YYYY-MM-DD, end exclusive), which are what
 *   FullCalendar takes for one. Its startAt and endAt are those dates at local midnight, kept so
 *   the range queries work for both kinds.
 * - A recurring series is one row: its first occurrence, recurrenceRule and timeZone. FullCalendar's
 *   rrule input is a DTSTART in timeZone followed by the rule, and its exdate input is exdates.
 * - A moved or edited occurrence of a series is its own row, with seriesId and originalStartAt.
 */
export interface Event extends Model<EventId> {
  calendarId: CalendarId;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  // set exactly when allDay is
  startDate: string | null;
  endDate: string | null;
  // IANA zone the event is in, e.g. "America/New_York"; a series expands in it
  timeZone: string | null;
  location: string | null;
  // RFC 5545 lines (RRULE, EXRULE, RDATE, EXDATE) joined with \n, as the source wrote them; no
  // DTSTART, which is startAt in timeZone
  recurrenceRule: string | null;
  // on a moved or edited occurrence: its series, and the start it had in the series
  seriesId: EventId | null;
  originalStartAt: Date | null;
  status: EventStatus;
  response: EventResponse | null;
  kind: EventKind;
  meetingUrl: string | null;
  // the event's own colour; null means its calendar's
  color: string | null;
  // set on every read
  // on a series: the starts of the occurrences it no longer has, cancelled or replaced by their
  // own row; empty for anything else
  exdates?: Date[];
  // the link to the provider item it mirrors, or null for a local event
  external?: ExternalRef | null;
}

export interface CreateEventOptions {
  title: string;
  description?: string;
  // the default local calendar when left out; a synced calendar is refused
  calendarId?: CalendarId;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  // for an all-day event: its dates, which override startAt and endAt. Left out, they are the
  // local days startAt and endAt fall on, endDate being the day after the last day touched
  startDate?: string;
  endDate?: string;
  // the app's zone when left out
  timeZone?: string;
  location?: string;
  recurrenceRule?: string;
  status?: EventStatus;
  kind?: EventKind;
  meetingUrl?: string;
  color?: string;
}

export interface UpdateEventOptions {
  title?: string;
  description?: string;
  calendarId?: CalendarId;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  location?: string;
  // nullable so a recurring event can be turned back into a one-off
  recurrenceRule?: string | null;
  status?: EventStatus;
  kind?: EventKind;
  meetingUrl?: string;
  color?: string | null;
}
