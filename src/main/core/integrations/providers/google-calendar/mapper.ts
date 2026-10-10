import TurndownService from 'turndown';
import { ExternalEvent } from '../../types';
import { EventKind, EventResponse, EventStatus } from '../../../events/types';
import { fromDateString } from '../../../events/dates';
import {
  EVENT_COLORS,
  EVENT_KIND,
  EVENT_STATUS,
  RESPONSE_STATUS,
  GoogleEvent,
  GoogleEventStub,
  GoogleEventTime,
  VIDEO_ENTRY_POINT,
} from './schema';

// Maps validated Google events to the normalised items, per the field mapping in the design.

export const NO_TITLE = '(No title)';

// what an event's calendar contributes to it
export interface CalendarContext {
  calendarId: string;
  // the calendar's own zone, for an event that names none
  timeZone: string | null;
}

// Google event ids are unique per calendar only, so the calendar is part of the external id
export function externalEventId(calendarId: string, eventId: string): string {
  return `${calendarId}:${eventId}`;
}

export function toExternalEvent(event: GoogleEvent, calendar: CalendarContext): ExternalEvent {
  const start = toTime(event.start);
  const end = toTime(event.end);
  return {
    externalId: externalEventId(calendar.calendarId, event.id),
    calendarId: calendar.calendarId,
    url: event.htmlLink,
    title: event.summary?.trim() || NO_TITLE,
    description: event.description ? descriptionToMarkdown(event.description) : null,
    startAt: start.at,
    endAt: end.at,
    allDay: start.allDay,
    startDate: start.date,
    endDate: end.date,
    timeZone: event.start.timeZone ?? calendar.timeZone,
    location: event.location || null,
    recurrenceRule: event.recurrence?.length ? event.recurrence.join('\n') : null,
    ...instanceOf(event, calendar.calendarId),
    meetingUrl: meetingUrl(event),
    // the event's own colour only; one without takes its calendar's when drawn, so a change to
    // the calendar's colour reaches all of them
    color: (event.colorId && EVENT_COLORS[event.colorId]) || null,
    status: EVENT_STATUS[event.status ?? 'confirmed'] ?? EventStatus.CONFIRMED,
    response: ownResponse(event),
    kind: EVENT_KIND[event.eventType ?? 'default'] ?? EventKind.DEFAULT,
    cancelled: false,
    createdAt: new Date(event.created ?? event.updated),
    updatedAt: new Date(event.updated),
  };
}

/**
 * A cancelled occurrence of a series. Google may send nothing but its id, the master's id and the
 * occurrence it replaces, so only those mean anything here: SyncWriter uses them to exclude the
 * occurrence from the master and to drop the instance's own row if it had one. The other fields
 * are filled so the item is well formed.
 */
export function toCancelledInstance(
  event: GoogleEventStub &
    Required<Pick<GoogleEventStub, 'recurringEventId' | 'originalStartTime'>>,
  calendar: CalendarContext,
): ExternalEvent {
  const original = toTime(event.originalStartTime);
  return {
    externalId: externalEventId(calendar.calendarId, event.id),
    calendarId: calendar.calendarId,
    url: '',
    title: NO_TITLE,
    description: null,
    startAt: original.at,
    endAt: original.at,
    allDay: original.allDay,
    startDate: original.date,
    endDate: original.date,
    timeZone: event.originalStartTime.timeZone ?? calendar.timeZone,
    location: null,
    recurrenceRule: null,
    ...instanceOf(event, calendar.calendarId),
    meetingUrl: null,
    color: null,
    status: EventStatus.CONFIRMED,
    response: null,
    kind: EventKind.DEFAULT,
    cancelled: true,
    createdAt: original.at,
    updatedAt: original.at,
  };
}

// the master and the occurrence an instance of a series replaces; null for anything else
function instanceOf(
  event: GoogleEventStub,
  calendarId: string,
): Pick<ExternalEvent, 'recurringEventExternalId' | 'originalStartAt'> {
  if (!event.recurringEventId || !event.originalStartTime) {
    return { recurringEventExternalId: null, originalStartAt: null };
  }
  return {
    recurringEventExternalId: externalEventId(calendarId, event.recurringEventId),
    originalStartAt: toTime(event.originalStartTime).at,
  };
}

// A timed value is an instant. A date-only one (an all-day event) keeps its date, which is what
// the calendar shows; its instant is the date's local midnight, for the range queries
function toTime(time: GoogleEventTime): { at: Date; allDay: boolean; date: string | null } {
  if (time.dateTime !== undefined) {
    return { at: new Date(time.dateTime), allDay: false, date: null };
  }
  return { at: fromDateString(time.date!), allDay: true, date: time.date! };
}

// the Meet link, or the video entry point of another conference provider
function meetingUrl(event: GoogleEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(
    (entryPoint) => entryPoint.entryPointType === VIDEO_ENTRY_POINT,
  );
  return video?.uri ?? null;
}

// the calendar's own answer to the invitation: Google marks with `self` the attendee entry of the
// calendar this copy of the event is on. On the primary calendar that is the account's answer; on a
// shared calendar, that calendar's. Null when it is not an attendee, e.g. its own event
// with no guests
function ownResponse(event: GoogleEvent): EventResponse | null {
  const self = event.attendees?.find((attendee) => attendee.self);
  return (self?.responseStatus && RESPONSE_STATUS[self.responseStatus]) || null;
}

// Converts Google's HTML descriptions to Markdown. Elements turndown has no rule for keep their
// text and lose the tag; those that carry no readable text are dropped entirely.
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
turndown.remove(['script', 'style', 'head', 'title', 'meta', 'link', 'iframe', 'object', 'embed']);

// any tag, which is how an HTML description is told from a plain-text one
const HTML_TAG = /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i;

export function descriptionToMarkdown(description: string): string | null {
  // a plain-text description, written through the API, keeps its own line breaks
  const markdown = HTML_TAG.test(description)
    ? turndown.turndown(description)
    : description.replace(/\r\n/g, '\n');
  return markdown.trim() || null;
}
