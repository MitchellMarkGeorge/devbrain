import type { CalendarId, EventId } from '@common/ids';
import type { EventKind, EventStatus } from '@common/types';

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
  // an IANA zone; the system zone when left out
  timeZone?: string;
  location?: string;
  // RFC 5545 RRULE, EXRULE, RDATE and EXDATE lines joined with \n, with at least one RRULE and no
  // DTSTART (startAt is the series' start); anything else is refused
  recurrenceRule?: string;
  status?: EventStatus;
  kind?: EventKind;
  meetingUrl?: string;
  color?: string;
}

/**
 * One occurrence of a series: the series, and the start the occurrence has in it. For an
 * occurrence FullCalendar expanded, that is its start; for a moved or edited occurrence row, its
 * seriesId and originalStartAt.
 */
export interface OccurrenceRef {
  seriesId: EventId;
  originalStartAt: Date;
}

// what an occurrence write applies to: the occurrence alone, or it and every later one. The whole
// series is written by its own id with updateEvent and deleteEvent.
export type OccurrenceScope = 'this' | 'following';

export interface UpdateEventOptions {
  title?: string;
  description?: string;
  calendarId?: CalendarId;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  startDate?: string;
  endDate?: string;
  // an IANA zone
  timeZone?: string;
  location?: string;
  // checked as on create; null turns a recurring event back into a one-off
  recurrenceRule?: string | null;
  status?: EventStatus;
  kind?: EventKind;
  meetingUrl?: string;
  color?: string | null;
}
