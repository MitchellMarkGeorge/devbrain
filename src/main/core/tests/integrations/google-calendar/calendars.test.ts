import { describe, it, expect } from 'vitest';
import { createGoogleCalendarProvider } from '../../../integrations/providers/google-calendar';
import { CalendarSource, ChangeTokenExpiredError } from '../../../integrations/providers/provider';
import { RateLimitError } from '../../../shared/errors';
import { MIRRORED_EVENT_TYPES } from '../../../integrations/providers/google-calendar/requests';
import { eventsPage, scriptedFetch } from './fake-fetch';
import calendarListFixture from '../fixtures/google-calendar/calendar-list.json';
import timedFixture from '../fixtures/google-calendar/event-timed.json';
import allDayFixture from '../fixtures/google-calendar/event-all-day.json';
import masterFixture from '../fixtures/google-calendar/event-recurring-master.json';
import cancelledInstanceFixture from '../fixtures/google-calendar/event-cancelled-instance.json';
import modifiedInstanceFixture from '../fixtures/google-calendar/event-modified-instance.json';
import declinedFixture from '../fixtures/google-calendar/event-declined.json';
import cancelledFixture from '../fixtures/google-calendar/event-cancelled.json';
import expiredFixture from '../fixtures/google-calendar/error-sync-token-expired.json';
import rateLimitedFixture from '../fixtures/google-calendar/error-rate-limited.json';

const AUTH = { authorization: 'Bearer access-token' };
const PRIMARY = 'ada@example.com';
const TEAM = 'c_team0123456789@group.calendar.google.com';
const FROM = '2026-09-09T12:00:00.000Z';

function source(steps: Parameters<typeof scriptedFetch>[0]) {
  const fetch = scriptedFetch(steps);
  const calendars: CalendarSource = createGoogleCalendarProvider({
    fetch,
    client: null,
  }).calendars!;
  return { fetch, calendars };
}

// the events requests, as calendar id and query parameters
function eventRequests(fetch: ReturnType<typeof scriptedFetch>) {
  return fetch.requests
    .filter((request) => request.url.pathname.endsWith('/events'))
    .map((request) => ({
      calendarId: decodeURIComponent(request.url.pathname.split('/').at(-2)!),
      // eventTypes repeats, which an object cannot hold; its value is checked on its own
      params: Object.fromEntries(
        [...request.url.searchParams].filter(([key]) => key !== 'eventTypes'),
      ),
      eventTypes: request.url.searchParams.getAll('eventTypes'),
    }))
    .map(({ eventTypes, ...request }) => {
      expect(eventTypes).toEqual(MIRRORED_EVENT_TYPES);
      return request;
    });
}

const FULL = { singleEvents: 'false', showDeleted: 'true', maxResults: '250' };

describe('Google Calendar source — getEventPage', () => {
  it('asks for everything from `from` on a full pass, handing out the change token', async () => {
    const { fetch, calendars } = source([
      { body: eventsPage([timedFixture, allDayFixture], { nextSyncToken: 'sync-1' }) },
    ]);

    const page = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM });

    expect(eventRequests(fetch)).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, timeMin: FROM } },
    ]);
    expect(page.events.map((event) => event.title)).toEqual(['Design review', 'Team offsite']);
    expect(page.events[0].externalId).toBe(`${PRIMARY}:${timedFixture.id}`);
    expect(page).toMatchObject({ nextPageToken: null, changeToken: 'sync-1', skipped: 0 });
  });

  it('sends only the change token, as Google’s sync token, for the changes since', async () => {
    const { fetch, calendars } = source([{ body: eventsPage([], { nextSyncToken: 'sync-2' }) }]);

    const page = await calendars.getEventPage(AUTH, TEAM, { changeToken: 'sync-1' });

    expect(eventRequests(fetch)).toEqual([
      { calendarId: TEAM, params: { ...FULL, syncToken: 'sync-1' } },
    ]);
    expect(page.changeToken).toBe('sync-2');
  });

  it('passes the page token on, and hands out the next one with no change token', async () => {
    const { fetch, calendars } = source([
      { body: eventsPage([timedFixture], { nextPageToken: 'page-3' }) },
    ]);

    const page = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM, pageToken: 'page-2' });

    expect(eventRequests(fetch)[0].params).toEqual({ ...FULL, timeMin: FROM, pageToken: 'page-2' });
    expect(page).toMatchObject({ nextPageToken: 'page-3', changeToken: null });
  });

  it('splits cancelled entries: an occurrence of a series, or a whole event', async () => {
    const { calendars } = source([
      {
        body: eventsPage([
          masterFixture,
          cancelledInstanceFixture,
          modifiedInstanceFixture,
          declinedFixture,
          cancelledFixture,
        ]),
      },
    ]);

    const page = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM });

    expect(page.cancelledIds).toEqual([`${PRIMARY}:${cancelledFixture.id}`]);
    expect(page.events.map((event) => [event.externalId, event.cancelled])).toEqual([
      [`${PRIMARY}:${masterFixture.id}`, false],
      [`${PRIMARY}:${cancelledInstanceFixture.id}`, true],
      [`${PRIMARY}:${modifiedInstanceFixture.id}`, false],
      [`${PRIMARY}:${declinedFixture.id}`, false],
    ]);
  });

  it('skips and counts an entry that does not validate, keeping the rest and its id if it has one', async () => {
    const { calendars } = source([
      { body: eventsPage([{ summary: 'no id' }, { ...timedFixture, start: {} }, allDayFixture]) },
    ]);
    const page = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM });
    expect(page.skipped).toBe(2);
    expect(page.skippedIds).toEqual([`${PRIMARY}:${timedFixture.id}`]);
    expect(page.events.map((event) => event.title)).toEqual(['Team offsite']);
  });

  it("gives an event with no zone of its own the page's, or none when the page has none", async () => {
    const { start, end, ...rest } = timedFixture;
    const floating = {
      ...rest,
      start: { dateTime: start.dateTime },
      end: { dateTime: end.dateTime },
    };
    const { calendars } = source([
      { body: { ...eventsPage([floating]), timeZone: 'Europe/Paris' } },
      { body: { ...eventsPage([floating]), timeZone: undefined } },
    ]);

    const withZone = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM });
    const without = await calendars.getEventPage(AUTH, PRIMARY, { from: FROM });

    expect(withZone.events[0].timeZone).toBe('Europe/Paris');
    expect(without.events[0].timeZone).toBeNull();
  });

  it('throws ChangeTokenExpiredError when Google no longer accepts the token', async () => {
    const { calendars } = source([{ status: 410, body: expiredFixture }]);
    await expect(
      calendars.getEventPage(AUTH, PRIMARY, { changeToken: 'stale' }),
    ).rejects.toBeInstanceOf(ChangeTokenExpiredError);
  });

  it('lets other failures through, e.g. a rate limit', async () => {
    const { calendars } = source([{ status: 403, body: rateLimitedFixture }]);
    await expect(calendars.getEventPage(AUTH, PRIMARY, { from: FROM })).rejects.toThrow(
      RateLimitError,
    );
  });
});

describe('Google Calendar source — listCalendars', () => {
  it('lists the calendars the account can read', async () => {
    const { calendars } = source([{ body: calendarListFixture }]);
    const listed = await calendars.listCalendars(AUTH);
    expect(listed.map((calendar) => [calendar.id, calendar.primary])).toEqual([
      [PRIMARY, true],
      [TEAM, false],
      ['en.usa#holiday@group.v.calendar.google.com', false],
    ]);
  });

  it('marks the primary calendar, which a new connection selects', async () => {
    const { calendars } = source([{ body: calendarListFixture }]);
    const listed = await calendars.listCalendars(AUTH);
    expect(listed.filter((calendar) => calendar.primary).map((calendar) => calendar.id)).toEqual([
      PRIMARY,
    ]);
  });
});
