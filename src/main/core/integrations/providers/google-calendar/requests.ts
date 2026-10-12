import { EVENTS_PAGE_SIZE } from '../../../sync/constants';

// What this adapter asks Google Calendar for: the request URLs and their query parameters. A field
// read from a response also needs its shape in ./schema.

export const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

// The event types mirrored, as the eventTypes filter. An allowlist, so a type Google adds later
// stays out until someone decides it belongs. Left out: workingLocation (a daily all-day marker,
// not an event) and birthday (generated from contacts, yearly). Changing this list changes the
// query a stored sync token was issued for, so it needs every calendar resynced; see the
// follow-ups doc.
export const MIRRORED_EVENT_TYPES = ['default', 'focusTime', 'outOfOffice', 'fromGmail'];

// Where a calendar's walk stands: a full pass from a lower time bound, or the changes since a sync
// token. These are the only parameters that differ between the two.
export type EventsWindow = { timeMin: string } | { syncToken: string };

// one page of the calendars the account has in its list
export function calendarListUrl(pageToken: string | null): string {
  const params = new URLSearchParams({ maxResults: '250' });
  if (pageToken) params.set('pageToken', pageToken);
  return `${CALENDAR_API_URL}/users/me/calendarList?${params}`;
}

// the account's primary calendar, whose id is the account's email address
export function primaryCalendarUrl(): string {
  return `${CALENDAR_API_URL}/users/me/calendarList/primary`;
}

// OpenID Connect userinfo: with the openid scope alone it returns the account's subject id
export const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * One page of a calendar's events. Full and incremental passes are built here and nowhere else, so
 * they cannot drift: Google requires every parameter but the window to match between the pass that
 * issued a sync token and the passes that use it.
 *
 * - singleEvents=false: series come as one master plus their exceptions, not expanded instances.
 * - showDeleted=true: cancelled events and occurrences come back, so they can be removed.
 * - eventTypes: only the types in MIRRORED_EVENT_TYPES.
 * - timeMin only on a full pass; Google refuses it alongside a syncToken.
 */
export function eventsUrl(
  calendarId: string,
  window: EventsWindow,
  pageToken: string | null,
): string {
  const params = new URLSearchParams({
    singleEvents: 'false',
    showDeleted: 'true',
    maxResults: String(EVENTS_PAGE_SIZE),
  });
  // repeated once per type
  for (const eventType of MIRRORED_EVENT_TYPES) params.append('eventTypes', eventType);
  if ('syncToken' in window) {
    params.set('syncToken', window.syncToken);
  } else {
    params.set('timeMin', window.timeMin);
  }
  if (pageToken) params.set('pageToken', pageToken);
  return `${CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
}
