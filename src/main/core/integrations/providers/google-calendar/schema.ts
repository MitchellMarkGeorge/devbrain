import { z } from 'zod';
import { EventKind, EventResponse, EventStatus } from '../../../events/types';

// What Google Calendar sends back: the response shapes the client validates against, and the
// values this adapter reads out of them. The requests that ask for these are in ./requests. Field
// names are written from memory of the v3 API and the design's provider reference, not checked
// against a live account; what still needs one is listed in
// tests/integrations/fixtures/google-calendar/README.md.

// an event's status when it was cancelled or deleted; such an entry may carry nothing but its id
// (and, for an instance of a series, recurringEventId and originalStartTime)
export const CANCELLED_STATUS = 'cancelled';

// Google's values, and what DevBrain stores for each

// status -> DevBrain status, for a live event; cancelled ones are removed instead
export const EVENT_STATUS: Record<string, EventStatus> = {
  confirmed: EventStatus.CONFIRMED,
  tentative: EventStatus.TENTATIVE,
};

// eventType -> DevBrain kind. The types left out of the sync (see MIRRORED_EVENT_TYPES) have no
// entry, and fromGmail (flights, reservations) is an ordinary event
export const EVENT_KIND: Record<string, EventKind> = {
  default: EventKind.DEFAULT,
  fromGmail: EventKind.DEFAULT,
  focusTime: EventKind.FOCUS_TIME,
  outOfOffice: EventKind.OUT_OF_OFFICE,
};

// attendees[].responseStatus -> DevBrain response
export const RESPONSE_STATUS: Record<string, EventResponse> = {
  needsAction: EventResponse.NEEDS_ACTION,
  accepted: EventResponse.ACCEPTED,
  tentative: EventResponse.TENTATIVE,
  declined: EventResponse.DECLINED,
};

// the conference entry point that is the meeting link, as opposed to dial-in numbers
export const VIDEO_ENTRY_POINT = 'video';

// the reasons a 403 carries when it is a rate limit rather than a refusal
export const RATE_LIMIT_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded'];
// seconds to wait, when Google sends it with a rate limit
export const RETRY_AFTER_HEADER = 'Retry-After';

// colorId -> hex, Google's fixed palette for event colours (the "event" half of colors.get). An
// event without a colorId takes its calendar's backgroundColor instead.
export const EVENT_COLORS: Record<string, string> = {
  '1': '#a4bdfc',
  '2': '#7ae7bf',
  '3': '#dbadff',
  '4': '#ff887c',
  '5': '#fbd75b',
  '6': '#ffb878',
  '7': '#46d6db',
  '8': '#e1e1e1',
  '9': '#5484ed',
  '10': '#51b749',
  '11': '#dc2127',
};

// RFC 3339 with an offset, e.g. "2026-10-12T10:00:00-04:00"
const dateTime = z.iso.datetime({ offset: true });

// a start, end or original start: `date` for an all-day event, `dateTime` for a timed one
const eventTimeSchema = z
  .object({
    date: z.iso.date().optional(),
    dateTime: dateTime.optional(),
    timeZone: z.string().optional(),
  })
  .refine((time) => (time.date === undefined) !== (time.dateTime === undefined), {
    message: 'exactly one of date and dateTime is set',
  });

// the userinfo response; `sub` is the account's stable subject id, which never changes, even when
// the account's email does. Other claims need scopes this adapter does not ask for.
export const userInfoSchema = z.object({
  sub: z.string().min(1),
});

export const calendarListEntrySchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  // the user's own name for a calendar shared with them
  summaryOverride: z.string().optional(),
  primary: z.boolean().optional(),
  backgroundColor: z.string().optional(),
  timeZone: z.string().optional(),
});

export const calendarListResponseSchema = z.object({
  items: z.array(calendarListEntrySchema).default([]),
  nextPageToken: z.string().optional(),
});

// Items are kept as unknown here and validated one by one, so a single bad event is skipped
// instead of failing the page.
export const eventsResponseSchema = z.object({
  // the calendar's own time zone, used when an event names none
  timeZone: z.string().optional(),
  items: z.array(z.unknown()).default([]),
  // set on every page but the last
  nextPageToken: z.string().optional(),
  // set on the last page only
  nextSyncToken: z.string().optional(),
});

// what every entry carries, cancelled ones included
export const eventStubSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  // set on an instance of a series: the master's event id, and the occurrence it replaces
  recurringEventId: z.string().optional(),
  originalStartTime: eventTimeSchema.optional(),
});

// a live event, with every field the mapper reads
export const eventSchema = eventStubSchema.extend({
  htmlLink: z.string(),
  summary: z.string().optional(),
  // HTML when written in Google Calendar's editor, plain text when written through the API
  description: z.string().optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  start: eventTimeSchema,
  end: eventTimeSchema,
  // RRULE, EXRULE, RDATE and EXDATE lines; set on a series master only
  recurrence: z.array(z.string()).optional(),
  hangoutLink: z.string().optional(),
  conferenceData: z
    .object({
      entryPoints: z.array(z.object({ entryPointType: z.string(), uri: z.string() })).optional(),
    })
    .optional(),
  attendees: z
    .array(
      z.object({
        // set on the entry for the account the request was made as
        self: z.boolean().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
  created: dateTime.optional(),
  updated: dateTime,
  // default, focusTime, outOfOffice, fromGmail, ...; absent means default
  eventType: z.string().optional(),
});

// the body of an error response
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

export type UserInfo = z.infer<typeof userInfoSchema>;
export type CalendarListEntry = z.infer<typeof calendarListEntrySchema>;
export type EventsResponse = z.infer<typeof eventsResponseSchema>;
export type GoogleEventStub = z.infer<typeof eventStubSchema>;
export type GoogleEvent = z.infer<typeof eventSchema>;
export type GoogleEventTime = z.infer<typeof eventTimeSchema>;
