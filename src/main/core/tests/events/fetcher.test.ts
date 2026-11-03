import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { events } from '@main/db/schema/events';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { EventFetcher } from '../../events/fetcher';
import { EventKind, EventStatus } from '../../events/types';
import type {
  CalendarEventPage,
  EventsQuery,
  Provider,
} from '../../integrations/providers/provider';
import {
  AuthType,
  ExternalEvent,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import { SearchService } from '../../search/service';
import { IntegrationAuthError, RateLimitError } from '../../shared/errors';
import { SyncStateManager } from '../../sync/sync-state';
import { SyncWriter } from '../../sync/writer';
import { createFakeCalendarProvider } from '../sync/fake-provider';
import { createDb } from '../utils';

// EventFetcher against a real database and SyncWriter, with a scripted calendar source.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-03T12:00:00.000Z');
// the lower bound of the window sync keeps
const WINDOW_FROM = new Date(NOW.getTime() - 30 * DAY);
const TWO_YEARS_AGO = new Date(NOW.getTime() - 730 * DAY);
const CALENDAR = 'ada@example.com';

let db: BetterSQLite3Database;
let workspacePath: string;
let syncState: SyncStateManager;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let calendarId: CalendarId;
let provider: Provider;
// what the source answers, page by page; a function is called with the query
let pages: (Partial<CalendarEventPage> | Error | ((query: EventsQuery) => void))[];
let queries: EventsQuery[];
let markNeedsReauth: Mock<(id: IntegrationId) => void>;
let logged: string[];
let closing: AbortController;
let fetcher: EventFetcher;

function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  const startAt = overrides.startAt ?? new Date(TWO_YEARS_AGO.getTime() + DAY);
  return {
    externalId: `${CALENDAR}:old-review`,
    calendarId: CALENDAR,
    url: 'https://www.google.com/calendar/event?eid=old-review',
    title: 'Old review',
    description: null,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: 'UTC',
    location: null,
    recurrenceRule: null,
    recurringEventExternalId: null,
    originalStartAt: null,
    meetingUrl: null,
    color: null,
    status: EventStatus.CONFIRMED,
    response: null,
    kind: EventKind.DEFAULT,
    cancelled: false,
    createdAt: startAt,
    updatedAt: startAt,
    ...overrides,
  };
}

function calendarRow() {
  return db.select().from(calendars).where(eq(calendars.id, calendarId)).get()!;
}

function titles(): string[] {
  return db
    .select({ title: events.title })
    .from(events)
    .where(eq(events.calendarId, calendarId))
    .all()
    .map((row) => row.title);
}

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-event-fetcher-'));
  syncState = new SyncStateManager(db);
  integrationId = db
    .insert(integrations)
    .values({
      provider: ProviderId.GOOGLE_CALENDAR,
      authType: AuthType.OAUTH,
      accountId: 'subject-1',
      accountLabel: CALENDAR,
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.EVENTS })
    .returning()
    .get().id;
  calendarId = db
    .insert(calendars)
    .values({ sourceId, externalId: CALENDAR, name: 'Ada', selected: true, timeZone: 'UTC' })
    .returning()
    .get().id;

  pages = [];
  queries = [];
  provider = createFakeCalendarProvider();
  provider.calendars!.getEventPage = async (_auth, _calendarId, query) => {
    queries.push(query);
    const next = pages.shift() ?? {};
    if (next instanceof Error) throw next;
    if (typeof next === 'function') {
      next(query);
      return emptyPage();
    }
    return { ...emptyPage(), ...next };
  };
  markNeedsReauth = vi.fn<(id: IntegrationId) => void>();
  logged = [];
  closing = new AbortController();
  fetcher = new EventFetcher({
    db,
    credentials: { getAuth: async () => ({ authorization: 'Bearer token' }) },
    providers: new Map([[ProviderId.GOOGLE_CALENDAR, provider]]),
    writer: new SyncWriter(db, new SearchService(db, workspacePath)),
    syncState,
    integrations: { markNeedsReauth },
    signal: closing.signal,
    logger: { ...console, error: (line: string) => logged.push(line) },
    now: () => NOW,
  });
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

function emptyPage(): CalendarEventPage {
  return {
    events: [],
    cancelledIds: [],
    skipped: 0,
    skippedIds: [],
    nextPageToken: null,
    changeToken: null,
  };
}

describe('EventFetcher — fetchHistory', () => {
  it('lists the gap before the window and saves it as a sync run would', async () => {
    pages = [{ events: [event()] }];

    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([calendarId]);

    expect(queries).toEqual([
      { from: TWO_YEARS_AGO.toISOString(), until: WINDOW_FROM.toISOString() },
    ]);
    expect(titles()).toEqual(['Old review']);
    // linked to its provider event, as a synced one is
    const link = db
      .select()
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.externalId, `${CALENDAR}:old-review`),
        ),
      )
      .get();
    expect(link?.eventId).toBeDefined();
    expect(calendarRow().historyLoadedFrom).toEqual(TWO_YEARS_AGO);
    // the sync cursor is not touched
    expect(syncState.getSyncTarget(sourceId).cursor).toBeNull();
  });

  it('pages with the same range, and records the history only after the last page', async () => {
    pages = [
      { events: [event()], nextPageToken: 'page-2' },
      () => expect(calendarRow().historyLoadedFrom).toBeNull(),
    ];

    await fetcher.fetchHistory(TWO_YEARS_AGO);

    const range = { from: TWO_YEARS_AGO.toISOString(), until: WINDOW_FROM.toISOString() };
    expect(queries).toEqual([range, { ...range, pageToken: 'page-2' }]);
    expect(calendarRow().historyLoadedFrom).toEqual(TWO_YEARS_AGO);
  });

  it('fetches nothing inside the window, for history already fetched, or for calendars out of the read', async () => {
    const hidden = db
      .insert(calendars)
      .values({ sourceId, externalId: 'hidden', name: 'Hidden', selected: true, visible: false })
      .returning()
      .get().id;
    db.insert(calendars)
      .values({ sourceId, externalId: 'unselected', name: 'Unselected', selected: false })
      .run();
    db.update(calendars)
      .set({ historyLoadedFrom: TWO_YEARS_AGO })
      .where(eq(calendars.id, calendarId))
      .run();

    expect(await fetcher.fetchHistory(new Date(NOW.getTime() - 10 * DAY))).toEqual([]);
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);
    expect(await fetcher.fetchHistory(new Date(TWO_YEARS_AGO.getTime() + DAY))).toEqual([]);
    // the hidden one is behind, but the read asks only for the other
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO, [calendarId])).toEqual([]);
    expect(queries).toEqual([]);

    // asked for directly, a hidden calendar is still left out
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO, [hidden])).toEqual([]);
    expect(queries).toEqual([]);
  });

  it('fetches only the new gap when a read reaches further back', async () => {
    db.update(calendars)
      .set({ historyLoadedFrom: TWO_YEARS_AGO })
      .where(eq(calendars.id, calendarId))
      .run();
    const older = new Date(TWO_YEARS_AGO.getTime() - 30 * DAY);

    await fetcher.fetchHistory(older);

    expect(queries).toEqual([{ from: older.toISOString(), until: TWO_YEARS_AGO.toISOString() }]);
    expect(calendarRow().historyLoadedFrom).toEqual(older);
  });

  it('records the history but returns no calendar when the gap had no events', async () => {
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);
    expect(calendarRow().historyLoadedFrom).toEqual(TWO_YEARS_AGO);
  });

  it('asks nothing when the provider may not be asked now', async () => {
    db.update(externalSources)
      .set({ retryAt: new Date(NOW.getTime() + 60_000) })
      .where(eq(externalSources.id, sourceId))
      .run();
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);

    db.update(externalSources)
      .set({ retryAt: null, enabled: false })
      .where(eq(externalSources.id, sourceId))
      .run();
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);

    expect(queries).toEqual([]);
    expect(calendarRow().historyLoadedFrom).toBeNull();
  });

  it('keeps what it saved but records nothing when a later page fails, so the next read tries again', async () => {
    pages = [{ events: [event()], nextPageToken: 'page-2' }, new Error('offline')];

    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);

    expect(titles()).toEqual(['Old review']);
    expect(calendarRow().historyLoadedFrom).toBeNull();
    expect(logged).toEqual([`Fetching calendar history failed calendar=${calendarId} error=Error`]);

    pages = [{ events: [event()] }];
    await fetcher.fetchHistory(TWO_YEARS_AGO);
    expect(calendarRow().historyLoadedFrom).toEqual(TWO_YEARS_AGO);
  });

  it('marks rejected credentials for re-authentication, and records a rate limit', async () => {
    pages = [new IntegrationAuthError('rejected')];
    await fetcher.fetchHistory(TWO_YEARS_AGO);
    expect(markNeedsReauth).toHaveBeenCalledExactlyOnceWith(integrationId);

    const retryAt = new Date(NOW.getTime() + 60_000);
    pages = [new RateLimitError(retryAt)];
    await fetcher.fetchHistory(TWO_YEARS_AGO);
    expect(syncState.getSyncTarget(sourceId).retryAt).toEqual(retryAt);
    expect(calendarRow().historyLoadedFrom).toBeNull();
  });

  it('saves nothing once the calendar is deselected or the workspace closes', async () => {
    // deselected while the request is in flight
    provider.calendars!.getEventPage = async (_auth, _calendarId, query) => {
      queries.push(query);
      db.update(calendars).set({ selected: false }).where(eq(calendars.id, calendarId)).run();
      return { ...emptyPage(), events: [event()] };
    };
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);
    expect(titles()).toEqual([]);
    expect(calendarRow().historyLoadedFrom).toBeNull();

    db.update(calendars).set({ selected: true }).where(eq(calendars.id, calendarId)).run();
    provider.calendars!.getEventPage = async (_auth, _calendarId, query) => {
      queries.push(query);
      closing.abort();
      return { ...emptyPage(), events: [event()] };
    };
    expect(await fetcher.fetchHistory(TWO_YEARS_AGO)).toEqual([]);
    expect(titles()).toEqual([]);
    expect(calendarRow().historyLoadedFrom).toBeNull();
  });
});
