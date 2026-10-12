import { z } from 'zod';
import { Auth } from '../../auth';
import { FetchFn } from '../provider';
import { ExternalCalendar } from '../../types';
import { BACKOFF_INITIAL_MS, HTTP_TIMEOUT_MS } from '../../../sync/constants';
import {
  IntegrationAuthError,
  ProviderUnavailableError,
  RateLimitError,
} from '../../../shared/errors';
import {
  EventsWindow,
  USERINFO_URL,
  calendarListUrl,
  eventsUrl,
  primaryCalendarUrl,
} from './requests';
import {
  CalendarListEntry,
  EventsResponse,
  UserInfo,
  RATE_LIMIT_REASONS,
  RETRY_AFTER_HEADER,
  calendarListEntrySchema,
  calendarListResponseSchema,
  errorResponseSchema,
  eventsResponseSchema,
  userInfoSchema,
} from './schema';

// A small JSON-over-fetch client for the Calendar API. It maps transport and auth failures to the
// shared error classes so the engine can react without knowing anything about Google, and a 410
// to SyncTokenExpiredError, which the event source handles itself.

// Google no longer accepts a calendar's sync token (or page token); that calendar must be walked
// again from the start
export class SyncTokenExpiredError extends Error {
  constructor() {
    super('Google Calendar sync token expired');
    this.name = 'SyncTokenExpiredError';
  }
}

// an error response that is not one of the mapped cases, e.g. a calendar that does not exist
export class GoogleApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Google Calendar API error (${status}): ${message}`);
    this.name = 'GoogleApiError';
    this.status = status;
  }
}

export interface GoogleCalendarClientOptions {
  fetch: FetchFn;
  now?: () => Date;
}

export class GoogleCalendarClient {
  private readonly fetch: FetchFn;
  private readonly now: () => Date;

  constructor(options: GoogleCalendarClientOptions) {
    this.fetch = options.fetch;
    this.now = options.now ?? (() => new Date());
  }

  // who the token belongs to; needs the openid scope
  async getUserInfo(auth: Auth): Promise<UserInfo> {
    return this.get(auth, USERINFO_URL, userInfoSchema);
  }

  async getPrimaryCalendar(auth: Auth): Promise<CalendarListEntry> {
    return this.get(auth, primaryCalendarUrl(), calendarListEntrySchema);
  }

  // every calendar in the account's Google calendar list (calendarList), across pages, with Google's
  // own ids, colours, zones and primary flag
  async listExternalCalendars(auth: Auth): Promise<ExternalCalendar[]> {
    const calendars: ExternalCalendar[] = [];
    let pageToken: string | null = null;
    do {
      const page: z.infer<typeof calendarListResponseSchema> = await this.get(
        auth,
        calendarListUrl(pageToken),
        calendarListResponseSchema,
      );
      calendars.push(...page.items.map(toCalendar));
      pageToken = page.nextPageToken ?? null;
    } while (pageToken !== null);
    return calendars;
  }

  // one page of a calendar's events; throws SyncTokenExpiredError on a 410
  async listEvents(
    auth: Auth,
    calendarId: string,
    window: EventsWindow,
    pageToken: string | null,
  ): Promise<EventsResponse> {
    return this.get(auth, eventsUrl(calendarId, window, pageToken), eventsResponseSchema);
  }

  // sends one GET and returns its body, validated against `schema`
  private async get<T>(auth: Auth, url: string, schema: z.ZodType<T>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: auth.authorization },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      // network failure or the timeout firing
      throw new ProviderUnavailableError('Google Calendar could not be reached', { cause: error });
    }

    const body = await readBody(response);
    if (response.status === 410) throw new SyncTokenExpiredError();
    if (response.status === 401) {
      throw new IntegrationAuthError('Google Calendar rejected the credentials');
    }
    if (response.status === 429 || (response.status === 403 && isRateLimit(body))) {
      throw new RateLimitError(this.retryAt(response.headers));
    }
    if (response.status >= 500) {
      throw new ProviderUnavailableError(`Google Calendar responded with ${response.status}`);
    }
    if (!response.ok) {
      const error = errorResponseSchema.safeParse(body);
      throw new GoogleApiError(
        response.status,
        (error.success && error.data.error.message) || response.statusText,
      );
    }
    if (body === null) {
      throw new GoogleApiError(response.status, 'response was not JSON');
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new GoogleApiError(response.status, `unexpected response: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  // Retry-After when Google sends it, else a short default
  private retryAt(headers: Headers): Date {
    const retryAfter = Number(headers.get(RETRY_AFTER_HEADER));
    const wait = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_INITIAL_MS;
    return new Date(this.now().getTime() + wait);
  }
}

function toCalendar(entry: CalendarListEntry): ExternalCalendar {
  return {
    id: entry.id,
    name: entry.summaryOverride ?? entry.summary ?? entry.id,
    primary: entry.primary ?? false,
    color: entry.backgroundColor ?? null,
    timeZone: entry.timeZone ?? null,
  };
}

function isRateLimit(body: unknown): boolean {
  const parsed = errorResponseSchema.safeParse(body);
  return (
    parsed.success &&
    (parsed.data.error.errors ?? []).some(
      (error) => error.reason !== undefined && RATE_LIMIT_REASONS.includes(error.reason),
    )
  );
}

async function readBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    // the connection dropped or the timeout fired while the body was streaming
    throw new ProviderUnavailableError('Google Calendar could not be reached', { cause: error });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
