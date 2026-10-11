import { describe, it, expect } from 'vitest';
import { GoogleCalendarClient } from '../../../integrations/providers/google-calendar/client';
import { GoogleEventSource } from '../../../integrations/providers/google-calendar/events';
import { EventPage } from '../../../integrations/providers/provider';
import { ExternalCalendar, GoogleEventCursor } from '../../../integrations/types';
import { EVENT_HISTORY_WINDOW_MS } from '../../../sync/constants';
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
import meetFixture from '../fixtures/google-calendar/event-meet-link.json';
import cancelledFixture from '../fixtures/google-calendar/event-cancelled.json';
import expiredFixture from '../fixtures/google-calendar/error-sync-token-expired.json';
import rateLimitedFixture from '../fixtures/google-calendar/error-rate-limited.json';

const AUTH = { authorization: 'Bearer access-token' };
const PRIMARY = 'ada@example.com';
const TEAM = 'c_team0123456789@group.calendar.google.com';
const NOW = new Date('2026-10-09T12:00:00Z');
const TIME_MIN = new Date(NOW.getTime() - EVENT_HISTORY_WINDOW_MS).toISOString();

const CALENDARS = { body: calendarListFixture };
// the calendars a run passes in, as the engine listed them
const PRIMARY_CALENDAR: ExternalCalendar = {
  id: PRIMARY,
  name: PRIMARY,
  primary: true,
  color: '#9fe1e7',
  timeZone: 'America/New_York',
};
const TEAM_CALENDAR: ExternalCalendar = {
  id: TEAM,
  name: 'Team',
  primary: false,
  color: '#42d692',
  timeZone: 'America/New_York',
};

function source(steps: Parameters<typeof scriptedFetch>[0], now = () => NOW) {
  const fetch = scriptedFetch(steps);
  const events = new GoogleEventSource(new GoogleCalendarClient({ fetch, now }), now);
  return { fetch, events };
}

// the events requests only, as calendar id and query parameters
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

describe('Google Calendar events — pull', () => {
  it('gives a new calendar a full pass from 30 days back, asking Google for its events only', async () => {
    const { fetch, events } = source([
      { body: eventsPage([timedFixture, allDayFixture], { nextSyncToken: 'sync-1' }) },
    ]);

    const page = await events.pull(AUTH, null, [PRIMARY_CALENDAR]);

    // the calendars come in with the call: nothing is listed
    expect(fetch.requests).toHaveLength(1);
    expect(eventRequests(fetch)).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
    expect(page.calendarExternalId).toBe(PRIMARY);
    expect(page.events.map((event) => event.title)).toEqual(['Design review', 'Team offsite']);
    expect(page.done).toBe(true);
    expect(page.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-1', pageToken: null } },
    });
  });

  it('sends only the sync token on the next run', async () => {
    const cursor: GoogleEventCursor = {
      calendars: { [PRIMARY]: { syncToken: 'sync-1', pageToken: null } },
    };
    const { fetch, events } = source([{ body: eventsPage([], { nextSyncToken: 'sync-2' }) }]);

    const page = await events.pull(AUTH, cursor, [PRIMARY_CALENDAR]);

    expect(eventRequests(fetch)).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'sync-1' } },
    ]);
    expect(page.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-2', pageToken: null } },
    });
  });

  it('pages a full pass with the same lower bound, resuming from the cursor', async () => {
    let clock = NOW;
    const { fetch, events } = source(
      [
        { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
        { body: eventsPage([allDayFixture], { nextSyncToken: 'sync-1' }) },
      ],
      () => clock,
    );

    const first = await events.pull(AUTH, null, [PRIMARY_CALENDAR]);
    expect(first.done).toBe(false);
    expect(first.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: null, pageToken: 'page-2', timeMin: TIME_MIN } },
      pending: [PRIMARY],
    });

    // time moves on between pages; the pass keeps asking the same question
    clock = new Date(NOW.getTime() + 60_000);
    const second = await events.pull(AUTH, first.nextCursor, [PRIMARY_CALENDAR]);

    expect(eventRequests(fetch)[1]).toEqual({
      calendarId: PRIMARY,
      params: { ...FULL, timeMin: TIME_MIN, pageToken: 'page-2' },
    });
    expect(fetch.requests).toHaveLength(2);
    expect(second.done).toBe(true);
    expect(second.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-1', pageToken: null } },
    });
  });

  it('keeps the sync token while an incremental pass pages', async () => {
    const cursor: GoogleEventCursor = {
      calendars: { [PRIMARY]: { syncToken: 'sync-1', pageToken: null } },
    };
    const { fetch, events } = source([
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { body: eventsPage([], { nextSyncToken: 'sync-2' }) },
    ]);

    const first = await events.pull(AUTH, cursor, [PRIMARY_CALENDAR]);
    await events.pull(AUTH, first.nextCursor, [PRIMARY_CALENDAR]);

    expect(eventRequests(fetch).map((request) => request.params)).toEqual([
      { ...FULL, syncToken: 'sync-1' },
      { ...FULL, syncToken: 'sync-1', pageToken: 'page-2' },
    ]);
  });

  it('visits the selected calendars in turn, and is done after the last', async () => {
    const { fetch, events } = source([
      { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) },
      { body: eventsPage([meetFixture], { nextSyncToken: 'team-1' }) },
    ]);
    const calendars = [PRIMARY_CALENDAR, TEAM_CALENDAR];

    const first = await events.pull(AUTH, null, calendars);
    expect(first).toMatchObject({ calendarExternalId: PRIMARY, done: false });
    expect(first.events[0].externalId).toBe(`${PRIMARY}:${timedFixture.id}`);

    const second = await events.pull(AUTH, first.nextCursor, calendars);
    expect(second).toMatchObject({ calendarExternalId: TEAM, done: true });
    expect(second.events[0]).toMatchObject({
      externalId: `${TEAM}:${meetFixture.id}`,
      calendarId: TEAM,
      timeZone: 'America/New_York',
      // none of its own: drawn in the calendar's
      color: null,
    });
    expect(second.nextCursor).toEqual({
      calendars: {
        [PRIMARY]: { syncToken: 'primary-1', pageToken: null },
        [TEAM]: { syncToken: 'team-1', pageToken: null },
      },
    });
    expect(eventRequests(fetch).map((request) => request.calendarId)).toEqual([PRIMARY, TEAM]);
  });

  it('gives an added calendar a full pass while the others stay incremental', async () => {
    const cursor: GoogleEventCursor = {
      calendars: { [PRIMARY]: { syncToken: 'primary-1', pageToken: null } },
    };
    const { fetch, events } = source([
      { body: eventsPage([], { nextSyncToken: 'primary-2' }) },
      { body: eventsPage([], { nextSyncToken: 'team-1' }) },
    ]);
    const calendars = [PRIMARY_CALENDAR, TEAM_CALENDAR];

    const first = await events.pull(AUTH, cursor, calendars);
    await events.pull(AUTH, first.nextCursor, calendars);

    expect(eventRequests(fetch)).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'primary-1' } },
      { calendarId: TEAM, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
  });

  it('drops a deselected calendar from the cursor', async () => {
    const cursor: GoogleEventCursor = {
      calendars: {
        [PRIMARY]: { syncToken: 'primary-1', pageToken: null },
        [TEAM]: { syncToken: 'team-1', pageToken: null },
      },
    };
    const { events } = source([{ body: eventsPage([], { nextSyncToken: 'primary-2' }) }]);

    const page = await events.pull(AUTH, cursor, [PRIMARY_CALENDAR]);

    expect(page.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'primary-2', pageToken: null } },
    });
  });

  it('passes over a pending calendar that is no longer passed in, and drops its entry', async () => {
    // a run that stopped before the team calendar, which has since been deselected or unshared
    const cursor: GoogleEventCursor = {
      calendars: {
        [PRIMARY]: { syncToken: 'primary-1', pageToken: null },
        [TEAM]: { syncToken: 'team-1', pageToken: null },
      },
      pending: [TEAM, PRIMARY],
    };
    const { fetch, events } = source([{ body: eventsPage([], { nextSyncToken: 'primary-2' }) }]);

    const page = await events.pull(AUTH, cursor, [PRIMARY_CALENDAR]);

    expect(page).toMatchObject({ calendarExternalId: PRIMARY, done: true });
    expect(eventRequests(fetch).map((request) => request.calendarId)).toEqual([PRIMARY]);
    expect(page.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'primary-2', pageToken: null } },
    });
  });

  it('is done at once with nothing selected', async () => {
    const { fetch, events } = source([]);
    const page = await events.pull(AUTH, null, []);
    expect(page).toEqual({
      calendarExternalId: null,
      events: [],
      cancelledIds: [],
      skipped: 0,
      done: true,
      nextCursor: { calendars: {} },
    });
    expect(eventRequests(fetch)).toEqual([]);
  });

  it('treats an unreadable cursor as none: a full pass for every calendar', async () => {
    const { fetch, events } = source([{ body: eventsPage([]) }]);
    await events.pull(AUTH, { mode: 'initial', after: null, maxUpdatedAt: null }, [
      PRIMARY_CALENDAR,
    ]);
    expect(eventRequests(fetch)[0].params).toEqual({ ...FULL, timeMin: TIME_MIN });
  });

  it('keeps nothing between calls: interleaved runs of two accounts each use their own calendars', async () => {
    const other: ExternalCalendar = { ...TEAM_CALENDAR, id: 'grace@example.com', primary: true };
    const { fetch, events } = source([
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { body: eventsPage([], { nextSyncToken: 'grace-1' }) },
      { body: eventsPage([], { nextSyncToken: 'ada-1' }) },
    ]);
    const ada = { authorization: 'Bearer ada' };
    const grace = { authorization: 'Bearer grace' };

    // Ada's run stops after its first page; Grace's whole run happens; then Ada's resumes
    const adaFirst = await events.pull(ada, null, [PRIMARY_CALENDAR]);
    const graceOnly = await events.pull(grace, null, [other]);
    const adaSecond = await events.pull(ada, adaFirst.nextCursor, [PRIMARY_CALENDAR]);

    expect(eventRequests(fetch).map((request) => request.calendarId)).toEqual([
      PRIMARY,
      'grace@example.com',
      PRIMARY,
    ]);
    expect(graceOnly).toMatchObject({ calendarExternalId: 'grace@example.com', done: true });
    expect(adaSecond).toMatchObject({ calendarExternalId: PRIMARY, done: true });
    expect(adaSecond.nextCursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'ada-1', pageToken: null } },
    });
  });

  it('splits cancelled entries: an occurrence of a series, or a whole event', async () => {
    const { events } = source([
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

    const page = await events.pull(AUTH, null, [PRIMARY_CALENDAR]);

    expect(page.cancelledIds).toEqual([`${PRIMARY}:${cancelledFixture.id}`]);
    expect(page.events.map((event) => [event.externalId, event.cancelled])).toEqual([
      [`${PRIMARY}:${masterFixture.id}`, false],
      [`${PRIMARY}:${cancelledInstanceFixture.id}`, true],
      [`${PRIMARY}:${modifiedInstanceFixture.id}`, false],
      [`${PRIMARY}:${declinedFixture.id}`, false],
    ]);
  });

  it('skips and counts an entry that does not validate, keeping the rest', async () => {
    const { events } = source([
      { body: eventsPage([{ summary: 'no id' }, { ...timedFixture, start: {} }, allDayFixture]) },
    ]);
    const page = await events.pull(AUTH, null, [PRIMARY_CALENDAR]);
    expect(page.skipped).toBe(2);
    expect(page.events.map((event) => event.title)).toEqual(['Team offsite']);
  });
});

describe('Google Calendar events — expired sync token', () => {
  it('clears only that calendar and walks it again from the time bound', async () => {
    const cursor: GoogleEventCursor = {
      calendars: {
        [PRIMARY]: { syncToken: 'primary-1', pageToken: null },
        [TEAM]: { syncToken: 'team-1', pageToken: null },
      },
    };
    const { fetch, events } = source([
      { body: eventsPage([], { nextSyncToken: 'primary-2' }) },
      { status: 410, body: expiredFixture },
      { body: eventsPage([meetFixture], { nextSyncToken: 'team-fresh' }) },
    ]);
    const calendars = [PRIMARY_CALENDAR, TEAM_CALENDAR];

    const first = await events.pull(AUTH, cursor, calendars);
    const second: EventPage = await events.pull(AUTH, first.nextCursor, calendars);

    expect(eventRequests(fetch)).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'primary-1' } },
      { calendarId: TEAM, params: { ...FULL, syncToken: 'team-1' } },
      { calendarId: TEAM, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
    expect(second.events.map((event) => event.title)).toEqual(['1:1 with Grace']);
    expect(second.nextCursor).toEqual({
      calendars: {
        [PRIMARY]: { syncToken: 'primary-2', pageToken: null },
        [TEAM]: { syncToken: 'team-fresh', pageToken: null },
      },
    });
  });

  it('restarts a full pass whose page token expired', async () => {
    const cursor: GoogleEventCursor = {
      calendars: {
        [PRIMARY]: { syncToken: null, pageToken: 'stale', timeMin: '2026-09-01T00:00:00.000Z' },
      },
      pending: [PRIMARY],
    };
    const { fetch, events } = source([
      { status: 410, body: expiredFixture },
      { body: eventsPage([]) },
    ]);
    await events.pull(AUTH, cursor, [PRIMARY_CALENDAR]);
    expect(eventRequests(fetch)[1].params).toEqual({ ...FULL, timeMin: TIME_MIN });
  });

  it('gives up on a second 410 in a row', async () => {
    const cursor: GoogleEventCursor = {
      calendars: { [PRIMARY]: { syncToken: 'primary-1', pageToken: null } },
    };
    const { events } = source([
      { status: 410, body: expiredFixture },
      { status: 410, body: expiredFixture },
    ]);
    await expect(events.pull(AUTH, cursor, [PRIMARY_CALENDAR])).rejects.toThrow(
      'sync token expired',
    );
  });

  it('lets other failures through, e.g. a rate limit', async () => {
    const { events } = source([{ status: 403, body: rateLimitedFixture }]);
    await expect(events.pull(AUTH, null, [PRIMARY_CALENDAR])).rejects.toThrow(RateLimitError);
  });
});

describe('Google Calendar events — calendars', () => {
  it('lists the calendars the account can read', async () => {
    const { events } = source([CALENDARS]);
    const calendars = await events.listExternalCalendars(AUTH);
    expect(calendars.map((calendar) => [calendar.id, calendar.primary])).toEqual([
      [PRIMARY, true],
      [TEAM, false],
      ['en.usa#holiday@group.v.calendar.google.com', false],
    ]);
  });

  it('marks the primary calendar, which a new connection selects', async () => {
    const { events } = source([CALENDARS]);
    const calendars = await events.listExternalCalendars(AUTH);
    expect(calendars.filter((calendar) => calendar.primary).map((calendar) => calendar.id)).toEqual(
      [PRIMARY],
    );
  });
});
