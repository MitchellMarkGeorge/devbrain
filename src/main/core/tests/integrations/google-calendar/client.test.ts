import { describe, it, expect, vi } from 'vitest';
import {
  GoogleApiError,
  GoogleCalendarClient,
  SyncTokenExpiredError,
} from '../../../integrations/providers/google-calendar/client';
import {
  createGoogleCalendarProvider,
  getAccount,
} from '../../../integrations/providers/google-calendar';
import { eventsUrl } from '../../../integrations/providers/google-calendar/requests';
import { BACKOFF_INITIAL_MS, HTTP_TIMEOUT_MS } from '../../../sync/constants';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';
import { scriptedFetch } from './fake-fetch';
import calendarListFixture from '../fixtures/google-calendar/calendar-list.json';
import primaryFixture from '../fixtures/google-calendar/primary-calendar.json';
import userInfoFixture from '../fixtures/google-calendar/userinfo.json';
import rateLimitedFixture from '../fixtures/google-calendar/error-rate-limited.json';
import forbiddenFixture from '../fixtures/google-calendar/error-forbidden.json';
import expiredFixture from '../fixtures/google-calendar/error-sync-token-expired.json';

const AUTH = { authorization: 'Bearer access-token' };
const NOW = new Date('2026-10-09T12:00:00Z');

function client(steps: Parameters<typeof scriptedFetch>[0]) {
  const fetch = scriptedFetch(steps);
  return { fetch, client: new GoogleCalendarClient({ fetch, now: () => NOW }) };
}

describe('Google Calendar client — requests', () => {
  it('sends a GET with the bearer token and a timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { fetch, client: google } = client([{ body: primaryFixture }]);
    await google.getPrimaryCalendar(AUTH);

    const [request] = fetch.requests;
    expect(request.method).toBe('GET');
    expect(request.url.toString()).toBe(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
    );
    expect(request.headers.authorization).toBe('Bearer access-token');
    expect(request.signal).not.toBeNull();
    expect(timeout).toHaveBeenCalledWith(HTTP_TIMEOUT_MS);
    timeout.mockRestore();
  });

  it('builds full and incremental requests that differ only in their window', () => {
    const full = new URL(
      eventsUrl('ada@example.com', { timeMin: '2026-09-09T12:00:00.000Z' }, null),
    );
    const incremental = new URL(eventsUrl('ada@example.com', { syncToken: 'token-1' }, null));

    expect(full.pathname).toBe('/calendar/v3/calendars/ada%40example.com/events');
    expect(incremental.pathname).toBe(full.pathname);
    expect(full.searchParams.get('timeMin')).toBe('2026-09-09T12:00:00.000Z');
    expect(full.searchParams.has('syncToken')).toBe(false);
    expect(incremental.searchParams.get('syncToken')).toBe('token-1');
    expect(incremental.searchParams.has('timeMin')).toBe(false);

    const rest = (url: URL) =>
      [...url.searchParams].filter(([key]) => key !== 'timeMin' && key !== 'syncToken');
    expect(rest(full)).toEqual([
      ['singleEvents', 'false'],
      ['showDeleted', 'true'],
      ['maxResults', '250'],
      // repeated once per mirrored type: workingLocation and birthday are left out
      ['eventTypes', 'default'],
      ['eventTypes', 'focusTime'],
      ['eventTypes', 'outOfOffice'],
      ['eventTypes', 'fromGmail'],
    ]);
    expect(rest(incremental)).toEqual(rest(full));
  });

  it('adds the page token to either window, and escapes the calendar id', () => {
    const url = new URL(
      eventsUrl('en.usa#holiday@group.v.calendar.google.com', { syncToken: 't' }, 'page-2'),
    );
    expect(url.pathname).toBe(
      '/calendar/v3/calendars/en.usa%23holiday%40group.v.calendar.google.com/events',
    );
    expect(url.searchParams.get('pageToken')).toBe('page-2');
    expect(url.searchParams.get('syncToken')).toBe('t');
  });

  it('lists calendars across pages, preferring the user-given name', async () => {
    const [primary, team, holidays] = calendarListFixture.items;
    const { fetch, client: google } = client([
      { body: { items: [primary, team], nextPageToken: 'page-2' } },
      { body: { items: [holidays] } },
    ]);

    const calendars = await google.listCalendars(AUTH);

    expect(fetch.requests.map((request) => request.url.searchParams.get('pageToken'))).toEqual([
      null,
      'page-2',
    ]);
    expect(calendars).toEqual([
      {
        id: 'ada@example.com',
        name: 'ada@example.com',
        primary: true,
        color: '#9fe1e7',
        timeZone: 'America/New_York',
      },
      {
        id: 'c_team0123456789@group.calendar.google.com',
        name: 'Team',
        primary: false,
        color: '#42d692',
        timeZone: 'Europe/London',
      },
      {
        id: 'en.usa#holiday@group.v.calendar.google.com',
        name: 'Holidays in United States',
        primary: false,
        color: '#16a765',
        timeZone: 'America/New_York',
      },
    ]);
  });

  it('identifies the account by its subject id, labelled with its email', async () => {
    const { fetch, client: google } = client([{ body: userInfoFixture }, { body: primaryFixture }]);

    expect(await getAccount(google, AUTH)).toEqual({
      accountId: '110248495921238986420',
      label: 'ada@example.com',
      userId: '110248495921238986420',
    });
    expect(fetch.requests.map((request) => request.url.toString())).toEqual([
      'https://openidconnect.googleapis.com/v1/userinfo',
      'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
    ]);
    expect(fetch.requests[0].headers.authorization).toBe('Bearer access-token');
  });

  it('refuses a userinfo response without a subject id', async () => {
    const { client: google } = client([{ body: { email: 'ada@example.com' } }]);
    await expect(getAccount(google, AUTH)).rejects.toThrow(GoogleApiError);
  });

  it('maps a userinfo 401, e.g. a token granted without openid, to IntegrationAuthError', async () => {
    const { client: google } = client([{ status: 401, body: { error: 'invalid_token' } }]);
    await expect(getAccount(google, AUTH)).rejects.toThrow(IntegrationAuthError);
  });
});

describe('Google Calendar client — errors', () => {
  const listEvents = (google: GoogleCalendarClient) =>
    google.listEvents(AUTH, 'ada@example.com', { syncToken: 'token-1' }, null);

  it('maps 410 to SyncTokenExpiredError', async () => {
    const { client: google } = client([{ status: 410, body: expiredFixture }]);
    await expect(listEvents(google)).rejects.toThrow(SyncTokenExpiredError);
  });

  it('maps 401 to IntegrationAuthError', async () => {
    const { client: google } = client([{ status: 401, body: { error: { code: 401 } } }]);
    await expect(listEvents(google)).rejects.toThrow(IntegrationAuthError);
  });

  it('maps a rate-limited 403 to RateLimitError, waiting for Retry-After', async () => {
    const { client: google } = client([
      { status: 403, body: rateLimitedFixture, headers: { 'Retry-After': '120' } },
    ]);
    const error = await listEvents(google).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAt).toEqual(new Date(NOW.getTime() + 120_000));
  });

  it('maps 429 to RateLimitError, waiting the initial backoff when there is no Retry-After', async () => {
    const { client: google } = client([{ status: 429, body: {} }]);
    const error = await listEvents(google).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAt).toEqual(new Date(NOW.getTime() + BACKOFF_INITIAL_MS));
  });

  it('keeps any other 403 a plain API error, so it is not retried as a rate limit', async () => {
    const { client: google } = client([{ status: 403, body: forbiddenFixture }]);
    await expect(listEvents(google)).rejects.toThrow(GoogleApiError);
  });

  it('maps a 5xx and a network failure to ProviderUnavailableError', async () => {
    const { client: down } = client([{ status: 503, body: {} }]);
    await expect(listEvents(down)).rejects.toThrow(ProviderUnavailableError);
    const { client: offline } = client([{ error: new TypeError('fetch failed') }]);
    await expect(listEvents(offline)).rejects.toThrow(ProviderUnavailableError);
  });

  it('rejects a response that does not match the expected shape', async () => {
    const { client: google } = client([{ body: { items: 'not a list' } }]);
    await expect(listEvents(google)).rejects.toThrow(GoogleApiError);
  });
});

describe('Google Calendar provider', () => {
  it('serves events only, connecting through OAuth when the build has a client', () => {
    const provider = createGoogleCalendarProvider({ fetch, client: { clientId: 'client-1' } });
    expect(provider.supports).toEqual(['events']);
    expect(provider.authMethods).toEqual(['oauth']);
    expect(provider.oauth?.clientId).toBe('client-1');
    expect(provider.events).toBeDefined();
    expect(provider.tasks).toBeUndefined();
  });

  it('declares no OAuth without a client, so it cannot connect', () => {
    const provider = createGoogleCalendarProvider({ fetch, client: null });
    expect(provider.authMethods).toEqual([]);
    expect(provider.oauth).toBeUndefined();
  });

  it('reads the client from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET by default', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'env-client.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'env-secret');
    try {
      const provider = createGoogleCalendarProvider({ fetch });
      expect(provider.oauth?.clientId).toBe('env-client.apps.googleusercontent.com');
      expect(provider.oauth?.clientSecret).toBe('env-secret');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
