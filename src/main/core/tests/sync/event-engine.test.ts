import { SyncStateManager } from '../../sync/sync-state';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import {
  externalEventExceptions,
  externalFullPassListed,
  externalLinks,
  externalSources,
  integrations,
} from '@main/db/schema/integrations';
import { events as eventsTable } from '@main/db/schema/events';
import { calendars } from '@main/db/schema/calendars';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import { eventsPage, scriptedFetch } from '../integrations/google-calendar/fake-fetch';
import calendarListFixture from '../integrations/fixtures/google-calendar/calendar-list.json';
import primaryFixture from '../integrations/fixtures/google-calendar/primary-calendar.json';
import userInfoFixture from '../integrations/fixtures/google-calendar/userinfo.json';
import timedFixture from '../integrations/fixtures/google-calendar/event-timed.json';
import allDayFixture from '../integrations/fixtures/google-calendar/event-all-day.json';
import masterFixture from '../integrations/fixtures/google-calendar/event-recurring-master.json';
import cancelledInstanceFixture from '../integrations/fixtures/google-calendar/event-cancelled-instance.json';
import modifiedInstanceFixture from '../integrations/fixtures/google-calendar/event-modified-instance.json';
import declinedFixture from '../integrations/fixtures/google-calendar/event-declined.json';
import meetFixture from '../integrations/fixtures/google-calendar/event-meet-link.json';
import cancelledFixture from '../integrations/fixtures/google-calendar/event-cancelled.json';
import expiredFixture from '../integrations/fixtures/google-calendar/error-sync-token-expired.json';
import { SyncEngine } from '../../sync/engine';
import { SyncWriter } from '../../sync/writer';
import { SyncMode, SyncRunOutcome, SyncSkipReason } from '../../sync/types';
import { EVENT_HISTORY_WINDOW_MS } from '../../sync/constants';
import { SearchService } from '../../search/service';
import { EventService } from '../../events/service';
import { NoteService } from '../../notes/service';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { OAuthClient } from '../../integrations/oauth/types';
import { createGoogleCalendarProvider } from '../../integrations/providers/google-calendar';
import { Provider } from '../../integrations/providers/provider';
import { ProviderRegistry } from '../../integrations/providers/registry';
import {
  IntegrationStatus,
  LinkState,
  Provider as ProviderId,
  SourceType,
} from '../../integrations/types';
import { ExternalReadOnlyError } from '../../shared/errors';
import { EventResponse } from '../../events/types';
import { CalendarService } from '../../calendars/service';
import { MIRRORED_EVENT_TYPES } from '../../integrations/providers/google-calendar/requests';

const PRIMARY = 'ada@example.com';
const TEAM = 'c_team0123456789@group.calendar.google.com';
const NOW = new Date('2026-10-09T12:00:00Z');
const TIME_MIN = new Date(NOW.getTime() - EVENT_HISTORY_WINDOW_MS).toISOString();
const CALENDARS = { body: calendarListFixture };
const LOGGER = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let db: BetterSQLite3Database;
let workspacePath: string;
let fetch: ReturnType<typeof scriptedFetch>;
let service: IntegrationService;
let engine: SyncEngine;
// what engine was built with, so a test can build one with a lower page cap
let engineOptions: ConstructorParameters<typeof SyncEngine>[1];
let events: EventService;
let notes: NoteService;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let writer: SyncWriter;
let calendarService: CalendarService;
// what connecting alone asked Google for and stored, before setup lists the calendars
let connectRequests: string[];
let calendarsAfterConnect: number;

// an OAuth client that skips the browser and hands out a token that never expires
const oauth: OAuthClient = {
  authorize: async (config) => ({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: null,
    scopes: config.scopes,
  }),
  refresh: async () => {
    throw new Error('not refreshed in these tests');
  },
  revoke: async () => {},
};

// Connecting asks for the account (its subject id, then its email from the primary calendar) and
// stores no calendars. Setup then stores a first listing, as a source's first run does, which
// selects the primary one, so every test starts with the calendar rows in place.
async function setup() {
  fetch = scriptedFetch([{ body: userInfoFixture }, { body: primaryFixture }, CALENDARS]);
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-event-engine-'));
  const provider = createGoogleCalendarProvider({
    fetch,
    now: () => NOW,
    client: { clientId: 'id' },
  });
  const providers: ProviderRegistry = new Map<ProviderId, Provider>([[provider.id, provider]]);
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  const search = new SearchService(db, workspacePath);
  writer = new SyncWriter(db, search);
  service = new IntegrationService(db, { credentials, providers, oauth });
  calendarService = new CalendarService(db);
  engineOptions = {
    integrations: service,
    syncState: new SyncStateManager(db),
    credentials,
    providers,
    writer,
    logger: LOGGER,
    now: () => NOW,
  };
  engine = new SyncEngine(db, engineOptions);
  events = new EventService(db);
  notes = new NoteService(db, workspacePath);

  const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
  integrationId = integration.id;
  sourceId = integration.sources[0].id;
  connectRequests = fetch.requests.map((request) => request.url.pathname);
  calendarsAfterConnect = calendarRows().length;
  writer.applyCalendarList(
    sourceId,
    await provider.calendars!.listCalendars({ authorization: 'Bearer access-1' }),
  );
}

function script(...steps: Parameters<typeof scriptedFetch>[0]) {
  fetch.requests.length = 0;
  fetch.steps.push(...steps);
}

function sourceRow() {
  return db.select().from(externalSources).where(eq(externalSources.id, sourceId)).get()!;
}

function linkOf(calendarId: string, eventId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(
      and(
        eq(externalLinks.sourceId, sourceId),
        eq(externalLinks.externalId, `${calendarId}:${eventId}`),
      ),
    )
    .get();
}

function eventCount(): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(eventsTable)
    .get()!.n;
}

// the events requests of the last run, as calendar id and query parameters
function eventRequests() {
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

// what the calendar view gets: each event's title, rule and exdates
async function visible() {
  const listed = await events.listForCalendar(
    new Date('2026-09-01T00:00:00Z'),
    new Date('2027-01-01T00:00:00Z'),
  );
  return listed
    .map(({ title, recurrenceRule, exdates }) => ({ title, recurrenceRule, exdates }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// a calendar's row id, by its Google id
function calendarIdOf(externalId: string): CalendarId {
  return db
    .select()
    .from(calendars)
    .where(and(eq(calendars.sourceId, sourceId), eq(calendars.externalId, externalId)))
    .get()!.id;
}

// the source's calendar rows, by Google id and whether each is selected
function calendarRows() {
  return db
    .select({ externalId: calendars.externalId, selected: calendars.selected })
    .from(calendars)
    .where(eq(calendars.sourceId, sourceId))
    .all();
}

// the Google ids of the source's selected calendars: the primary first, then by name
function selected(): string[] {
  return db
    .select({ externalId: calendars.externalId })
    .from(calendars)
    .where(and(eq(calendars.sourceId, sourceId), eq(calendars.selected, true)))
    .orderBy(desc(calendars.isPrimary), asc(calendars.name))
    .all()
    .map((row) => row.externalId!);
}

// selects exactly these calendars, by Google id, as the calendar picker would
async function choose(...externalIds: string[]) {
  for (const row of db.select().from(calendars).where(eq(calendars.sourceId, sourceId)).all()) {
    const wanted = externalIds.includes(row.externalId!);
    if (row.selected !== wanted) await calendarService.setSelected(row.id, wanted);
  }
}

const SERIES_RULE = 'RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO';
// the cancelled (19 Oct) and moved (26 Oct) occurrences of the weekly series, 10:00 New York
const CANCELLED_OCCURRENCE = new Date('2026-10-19T14:00:00Z');
const MOVED_OCCURRENCE = new Date('2026-10-26T14:00:00Z');

const FULL = { singleEvents: 'false', showDeleted: 'true', maxResults: '250' };

beforeEach(setup);

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('Google Calendar sync — connect', () => {
  it('connects through OAuth, asking only for the account', async () => {
    const integration = await service.getById(integrationId);
    expect(integration).toMatchObject({
      provider: ProviderId.GOOGLE_CALENDAR,
      accountLabel: PRIMARY,
      status: IntegrationStatus.CONNECTED,
      sources: [{ sourceType: SourceType.EVENTS, enabled: true }],
    });
    // the calendars are left to the events source: listed when it is first used
    expect(connectRequests).toEqual(['/v1/userinfo', '/calendar/v3/users/me/calendarList/primary']);
    expect(calendarsAfterConnect).toBe(0);
    // the selection is in calendars, not in the source's config
    expect(sourceRow().config).toEqual({});
    expect(fetch.requests[0].headers.authorization).toBe('Bearer access-1');
    // the subject id, which survives a change of email
    const row = db.select().from(integrations).where(eq(integrations.id, integrationId)).get()!;
    expect(row.accountId).toBe(userInfoFixture.sub);
  });
});

describe('Google Calendar sync — initial and incremental', () => {
  it('lists the calendars on the first run of a source that has none, selecting the primary', async () => {
    db.delete(calendars).where(eq(calendars.sourceId, sourceId)).run();
    // one listing, at the start of the run, stores the calendars and gives the run its own
    script(CALENDARS, { body: eventsPage([timedFixture], { nextSyncToken: 'sync-1' }) });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({
      outcome: SyncRunOutcome.COMPLETED,
      inserted: 1,
      changed: ['calendar', 'event'],
    });
    expect(fetch.requests).toHaveLength(2);
    expect(calendarRows()).toEqual([
      { externalId: PRIMARY, selected: true },
      { externalId: TEAM, selected: false },
      { externalId: 'en.usa#holiday@group.v.calendar.google.com', selected: false },
    ]);
    expect(eventRequests()).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
  });

  it('mirrors every fixture on the initial sync and stores the sync token', async () => {
    script(CALENDARS, {
      body: eventsPage([timedFixture, allDayFixture, masterFixture, declinedFixture, meetFixture], {
        nextSyncToken: 'sync-1',
      }),
    });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({
      outcome: SyncRunOutcome.COMPLETED,
      mode: SyncMode.INITIAL,
      pages: 1,
      inserted: 5,
      changed: ['event'],
    });
    expect(eventRequests()).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-1', pageToken: null } },
    });
    expect(sourceRow().initialSyncCompletedAt).toEqual(NOW);

    const offsite = await events.getById(linkOf(PRIMARY, allDayFixture.id)!.eventId!);
    expect(offsite).toMatchObject({
      calendarId: calendarIdOf(PRIMARY),
      allDay: true,
      startDate: '2026-10-14',
      endDate: '2026-10-16',
      startAt: new Date(2026, 9, 14),
    });
    const meet = await events.getById(linkOf(PRIMARY, meetFixture.id)!.eventId!);
    expect(meet).toMatchObject({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      response: EventResponse.TENTATIVE,
    });
    expect(await events.getById(linkOf(PRIMARY, declinedFixture.id)!.eventId!)).toMatchObject({
      response: EventResponse.DECLINED,
    });
    expect(await events.getById(linkOf(PRIMARY, masterFixture.id)!.eventId!)).toMatchObject({
      timeZone: 'America/New_York',
      recurrenceRule: SERIES_RULE,
    });
  });

  it('sends only the sync token on the next run', async () => {
    script(CALENDARS, { body: eventsPage([timedFixture], { nextSyncToken: 'sync-1' }) });
    await engine.runSource(sourceId);

    script(CALENDARS, {
      body: eventsPage(
        [{ ...timedFixture, summary: 'Design review v2', updated: '2026-10-08T09:00:00Z' }],
        {
          nextSyncToken: 'sync-2',
        },
      ),
    });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ mode: SyncMode.INCREMENTAL, updated: 1 });
    expect(eventRequests()).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'sync-1' } },
    ]);
    expect((await visible()).map((event) => event.title)).toEqual(['Design review v2']);
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-2', pageToken: null } },
    });
  });

  it('commits page by page, resuming a full pass from its page token', async () => {
    script(
      CALENDARS,
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { error: new TypeError('fetch failed') },
    );
    const failed = await engine.runSource(sourceId);
    expect(failed).toMatchObject({ outcome: SyncRunOutcome.FAILED, pages: 1, inserted: 1 });

    // every run lists the calendars afresh, a resumed one too, then picks up the page token
    script(CALENDARS, { body: eventsPage([allDayFixture], { nextSyncToken: 'sync-1' }) });
    const resumed = await engine.runSource(sourceId);

    expect(resumed).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, mode: SyncMode.INITIAL });
    expect(fetch.requests).toHaveLength(2);
    expect(eventRequests()[0].params).toEqual({ ...FULL, timeMin: TIME_MIN, pageToken: 'page-2' });
    expect(eventCount()).toBe(2);
  });

  it('resyncs a calendar fully on 410, with no duplicate rows and linked notes intact', async () => {
    script(CALENDARS, {
      body: eventsPage([timedFixture, masterFixture, cancelledInstanceFixture], {
        nextSyncToken: 'sync-1',
      }),
    });
    await engine.runSource(sourceId);
    const eventId = linkOf(PRIMARY, timedFixture.id)!.eventId!;
    const note = await notes.createNote({ title: 'Review notes', linkedEventId: eventId });
    const series = await events.getById(linkOf(PRIMARY, masterFixture.id)!.eventId!);

    script(
      CALENDARS,
      { status: 410, body: expiredFixture },
      {
        body: eventsPage([timedFixture, masterFixture, cancelledInstanceFixture], {
          nextSyncToken: 'sync-fresh',
        }),
      },
    );
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, inserted: 0 });
    expect(eventRequests()).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'sync-1' } },
      { calendarId: PRIMARY, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
    expect(eventCount()).toBe(2);
    expect(linkOf(PRIMARY, timedFixture.id)!.eventId).toBe(eventId);
    expect((await notes.getById(note.id)).linkedEventId).toBe(eventId);
    expect(await events.getById(series.id)).toMatchObject({
      recurrenceRule: series.recurrenceRule,
      exdates: [CANCELLED_OCCURRENCE],
    });
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-fresh', pageToken: null } },
    });
  });
});

describe('Google Calendar sync — what a full pass no longer lists', () => {
  // a first full pass of these events, then a 410 on the next run's sync token, so the calendar
  // starts a full pass again; returns the next run's steps after the 410
  // the external ids the source's full passes have listed so far
  function listing() {
    return db
      .select({ externalId: externalFullPassListed.externalId })
      .from(externalFullPassListed)
      .where(eq(externalFullPassListed.sourceId, sourceId))
      .all()
      .map((row) => row.externalId);
  }

  async function syncThenExpire(...items: unknown[]) {
    script(CALENDARS, { body: eventsPage(items, { nextSyncToken: 'sync-1' }) });
    await engine.runSource(sourceId);
    return (...pages: Parameters<typeof scriptedFetch>[0]) =>
      script(CALENDARS, { status: 410, body: expiredFixture }, ...pages);
  }

  it('removes an event the full pass after a 410 does not list', async () => {
    const expire = await syncThenExpire(timedFixture, declinedFixture);

    expire({ body: eventsPage([timedFixture], { nextSyncToken: 'sync-fresh' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(linkOf(PRIMARY, declinedFixture.id)).toBeUndefined();
    expect(linkOf(PRIMARY, timedFixture.id)!.state).toBe(LinkState.SYNCED);
    expect((await visible()).map((event) => event.title)).toEqual(['Design review']);
    // the pass's id and its listing go with the pass
    expect(listing()).toEqual([]);
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'sync-fresh', pageToken: null } },
    });
  });

  it('keeps an event a note links to, hidden, when the full pass does not list it', async () => {
    const expire = await syncThenExpire(timedFixture);
    const eventId = linkOf(PRIMARY, timedFixture.id)!.eventId!;
    const note = await notes.createNote({ title: 'Review notes', linkedEventId: eventId });

    expire({ body: eventsPage([], { nextSyncToken: 'sync-fresh' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(await visible()).toEqual([]);
    expect(await events.getById(eventId)).toMatchObject({
      title: 'Design review',
      external: { state: LinkState.REMOVED },
    });
    expect((await notes.getById(note.id)).linkedEventId).toBe(eventId);
  });

  it('removes only what none of the pages of a full pass list', async () => {
    const expire = await syncThenExpire(timedFixture, declinedFixture, meetFixture, allDayFixture);

    expire(
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { body: eventsPage([meetFixture], { nextPageToken: 'page-3' }) },
      { body: eventsPage([], { nextSyncToken: 'sync-fresh' }) },
    );
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, pages: 3, removed: 2 });
    expect(linkOf(PRIMARY, declinedFixture.id)).toBeUndefined();
    expect(linkOf(PRIMARY, allDayFixture.id)).toBeUndefined();
    expect(eventCount()).toBe(2);
  });

  it('removes nothing until a full pass cut short is resumed to its end', async () => {
    const expire = await syncThenExpire(timedFixture, declinedFixture, allDayFixture);

    // the pass's first page commits, then the run fails
    expire(
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { error: new TypeError('fetch failed') },
    );
    const failed = await engine.runSource(sourceId);
    expect(failed).toMatchObject({ outcome: SyncRunOutcome.FAILED, pages: 1, removed: 0 });
    expect(eventCount()).toBe(3);
    // what the committed page listed is kept for the run that resumes the pass
    expect(listing()).toEqual([`${PRIMARY}:${timedFixture.id}`]);

    // the next run resumes the same pass; what its first page listed counts as listed
    script(CALENDARS, { body: eventsPage([allDayFixture], { nextSyncToken: 'sync-fresh' }) });
    const resumed = await engine.runSource(sourceId);

    expect(eventRequests()[0].params).toEqual({ ...FULL, timeMin: TIME_MIN, pageToken: 'page-2' });
    expect(resumed).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(linkOf(PRIMARY, declinedFixture.id)).toBeUndefined();
    expect(linkOf(PRIMARY, timedFixture.id)!.state).toBe(LinkState.SYNCED);
    expect(linkOf(PRIMARY, allDayFixture.id)!.state).toBe(LinkState.SYNCED);
    expect(listing()).toEqual([]);
  });

  it('forgets the listing of a pass cut short when its calendar is deselected', async () => {
    const expire = await syncThenExpire(timedFixture);
    expire(
      { body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) },
      { error: new TypeError('fetch failed') },
    );
    await engine.runSource(sourceId);
    expect(listing()).toHaveLength(1);

    await choose();
    script(CALENDARS);
    await engine.runSource(sourceId);

    expect(listing()).toEqual([]);
  });

  it('removes nothing when a run stops at the page cap part-way through a full pass', async () => {
    const expire = await syncThenExpire(timedFixture, declinedFixture);
    const capped = new SyncEngine(db, { ...engineOptions, maxPagesPerRun: 1 });

    expire({ body: eventsPage([timedFixture], { nextPageToken: 'page-2' }) });
    const result = await capped.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.FAILED, pages: 1, removed: 0 });
    expect(linkOf(PRIMARY, declinedFixture.id)!.state).toBe(LinkState.SYNCED);
  });

  it('leaves an event that ended before the full pass looked', async () => {
    // mirrored by an earlier pass, from further back than this one looks
    const old = {
      ...timedFixture,
      id: 'old0123456789',
      summary: 'Kickoff',
      start: { dateTime: '2026-08-03T10:00:00-04:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-08-03T11:00:00-04:00', timeZone: 'America/New_York' },
    };
    const expire = await syncThenExpire(old, timedFixture);

    expire({ body: eventsPage([], { nextSyncToken: 'sync-fresh' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(linkOf(PRIMARY, old.id)!.state).toBe(LinkState.SYNCED);
    expect(linkOf(PRIMARY, timedFixture.id)).toBeUndefined();
  });

  it("replaces a series' exceptions with those the full pass lists", async () => {
    // a cancellation parked for a series that is not mirrored
    const orphaned = {
      ...cancelledInstanceFixture,
      id: 'orphan0123456789_20261019T140000Z',
      recurringEventId: 'orphan0123456789',
    };
    const expire = await syncThenExpire(
      masterFixture,
      cancelledInstanceFixture,
      modifiedInstanceFixture,
      orphaned,
    );
    expect((await visible())[0].exdates).toEqual([CANCELLED_OCCURRENCE, MOVED_OCCURRENCE]);
    expect(db.select().from(externalEventExceptions).all()).toHaveLength(1);

    // the cancelled occurrence was restored and the moved one put back, and the orphan's series
    // is gone, while the stale token kept Google from saying so
    expire({ body: eventsPage([masterFixture], { nextSyncToken: 'sync-fresh' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(await visible()).toEqual([
      { title: 'Weekly sync', recurrenceRule: SERIES_RULE, exdates: [] },
    ]);
    expect(linkOf(PRIMARY, modifiedInstanceFixture.id)).toBeUndefined();
    expect(db.select().from(externalEventExceptions).all()).toEqual([]);
  });

  it('keeps the exceptions a full pass lists again, on any of its pages', async () => {
    const expire = await syncThenExpire(masterFixture, cancelledInstanceFixture);

    expire(
      { body: eventsPage([cancelledInstanceFixture], { nextPageToken: 'page-2' }) },
      { body: eventsPage([masterFixture], { nextSyncToken: 'sync-fresh' }) },
    );
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 0 });
    expect((await visible())[0].exdates).toEqual([CANCELLED_OCCURRENCE]);
  });
});

describe('Google Calendar sync — a weekly series', () => {
  it('mirrors a series with a moved and a cancelled occurrence', async () => {
    script(CALENDARS, {
      body: eventsPage([masterFixture, modifiedInstanceFixture, cancelledInstanceFixture], {
        nextSyncToken: 'sync-1',
      }),
    });
    await engine.runSource(sourceId);

    // what FullCalendar gets: the rule as Google sent it, and the two occurrences it no longer has
    expect(await visible()).toEqual([
      {
        title: 'Weekly sync',
        recurrenceRule: SERIES_RULE,
        exdates: [CANCELLED_OCCURRENCE, MOVED_OCCURRENCE],
      },
      { title: 'Weekly sync (moved to Tuesday)', recurrenceRule: null, exdates: [] },
    ]);
    expect(
      await events.getById(linkOf(PRIMARY, modifiedInstanceFixture.id)!.eventId!),
    ).toMatchObject({
      seriesId: linkOf(PRIMARY, masterFixture.id)!.eventId,
      originalStartAt: MOVED_OCCURRENCE,
    });
  });

  it('excludes an occurrence cancelled later, and one moved later, which also gets a row', async () => {
    script(CALENDARS, { body: eventsPage([masterFixture], { nextSyncToken: 'sync-1' }) });
    await engine.runSource(sourceId);

    script(CALENDARS, {
      body: eventsPage([cancelledInstanceFixture], { nextSyncToken: 'sync-2' }),
    });
    await engine.runSource(sourceId);
    expect((await visible())[0]).toMatchObject({
      recurrenceRule: SERIES_RULE,
      exdates: [CANCELLED_OCCURRENCE],
    });

    script(CALENDARS, { body: eventsPage([modifiedInstanceFixture], { nextSyncToken: 'sync-3' }) });
    await engine.runSource(sourceId);
    expect(eventCount()).toBe(2);
    expect((await visible())[0]).toMatchObject({
      recurrenceRule: SERIES_RULE,
      exdates: [CANCELLED_OCCURRENCE, MOVED_OCCURRENCE],
    });
  });

  it('applies exceptions that came a page before their master', async () => {
    script(
      CALENDARS,
      {
        body: eventsPage([cancelledInstanceFixture, modifiedInstanceFixture], {
          nextPageToken: 'page-2',
        }),
      },
      { body: eventsPage([masterFixture], { nextSyncToken: 'sync-1' }) },
    );
    await engine.runSource(sourceId);

    expect((await visible())[0]).toMatchObject({
      recurrenceRule: SERIES_RULE,
      exdates: [CANCELLED_OCCURRENCE, MOVED_OCCURRENCE],
    });
  });
});

describe('Google Calendar sync — removal and read-only', () => {
  it('hides a cancelled event with a linked note, which still resolves it by id', async () => {
    script(CALENDARS, {
      body: eventsPage([timedFixture, declinedFixture], { nextSyncToken: 'sync-1' }),
    });
    await engine.runSource(sourceId);
    const eventId = linkOf(PRIMARY, timedFixture.id)!.eventId!;
    await notes.createNote({ linkedEventId: eventId });

    script(CALENDARS, {
      body: eventsPage(
        [
          { ...cancelledFixture, id: timedFixture.id },
          { ...cancelledFixture, id: declinedFixture.id },
        ],
        { nextSyncToken: 'sync-2' },
      ),
    });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ removed: 2 });
    expect(await visible()).toEqual([]);
    expect(await events.getById(eventId)).toMatchObject({
      title: 'Design review',
      external: { state: LinkState.REMOVED },
    });
    // nothing linked to the declined one, so it is gone
    expect(linkOf(PRIMARY, declinedFixture.id)).toBeUndefined();
    expect(eventCount()).toBe(1);
  });

  it('refuses updateEvent and deleteEvent on a synced event', async () => {
    script(CALENDARS, { body: eventsPage([timedFixture], { nextSyncToken: 'sync-1' }) });
    await engine.runSource(sourceId);
    const eventId = linkOf(PRIMARY, timedFixture.id)!.eventId!;

    await expect(events.updateEvent(eventId, { title: 'Mine' })).rejects.toThrow(
      ExternalReadOnlyError,
    );
    await expect(events.deleteEvent(eventId)).rejects.toThrow(ExternalReadOnlyError);
  });
});

describe('Google Calendar sync — calendar selection', () => {
  it('refreshes the calendar rows at the start of each run, saying so only when one changed', async () => {
    script(CALENDARS, { body: eventsPage([], { nextSyncToken: 'sync-1' }) });
    const unchanged = await engine.runSource(sourceId);
    expect(unchanged.changed).toEqual([]);

    // recoloured in Google since the last run
    const recoloured = {
      body: {
        ...calendarListFixture,
        items: calendarListFixture.items.map((item) =>
          item.id === PRIMARY ? { ...item, backgroundColor: '#000000' } : item,
        ),
      },
    };
    script(recoloured, { body: eventsPage([], { nextSyncToken: 'sync-2' }) });
    const result = await engine.runSource(sourceId);

    expect(result.changed).toEqual(['calendar']);
    expect(
      db
        .select()
        .from(calendars)
        .where(eq(calendars.id, calendarIdOf(PRIMARY)))
        .get(),
    ).toMatchObject({ color: '#000000', selected: true });
  });

  it('passes over a selected calendar the account no longer lists, keeping its row', async () => {
    await choose(PRIMARY, TEAM);
    const withoutTeam = {
      body: {
        ...calendarListFixture,
        items: calendarListFixture.items.filter((item) => item.id !== TEAM),
      },
    };
    script(withoutTeam, { body: eventsPage([timedFixture], { nextSyncToken: 'sync-1' }) });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, inserted: 1 });
    expect(eventRequests().map((request) => request.calendarId)).toEqual([PRIMARY]);
    expect(selected()).toEqual([PRIMARY, TEAM]);
  });

  it('refreshes the rows a run lists, which CalendarService returns with the selected ones marked', async () => {
    db.update(calendars).set({ name: 'Stale name' }).where(eq(calendars.externalId, TEAM)).run();
    script(CALENDARS, { body: eventsPage([], { nextSyncToken: 'sync-1' }) });

    await engine.runSource(sourceId);
    const listed = (await calendarService.list()).filter(
      (calendar) => calendar.sourceId === sourceId,
    );

    expect(
      listed.map((calendar) => [
        calendar.name,
        calendar.isPrimary,
        calendar.selected,
        calendar.visible,
      ]),
    ).toEqual([
      [PRIMARY, true, true, true],
      ['Holidays in United States', false, false, true],
      ['Team', false, false, true],
    ]);
  });

  it('syncs only an added calendar fully', async () => {
    script(CALENDARS, { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) });
    await engine.runSource(sourceId);

    await choose(PRIMARY, TEAM);
    expect(selected()).toEqual([PRIMARY, TEAM]);

    script(
      CALENDARS,
      { body: eventsPage([], { nextSyncToken: 'primary-2' }) },
      { body: eventsPage([meetFixture], { nextSyncToken: 'team-1' }) },
    );
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, pages: 2, inserted: 1 });
    expect(eventRequests()).toEqual([
      { calendarId: PRIMARY, params: { ...FULL, syncToken: 'primary-1' } },
      { calendarId: TEAM, params: { ...FULL, timeMin: TIME_MIN } },
    ]);
    expect(await events.getById(linkOf(TEAM, meetFixture.id)!.eventId!)).toMatchObject({
      calendarId: calendarIdOf(TEAM),
    });
  });

  it("removes a deselected calendar's unlinked events at the next run, and resyncs it fully if picked again", async () => {
    await choose(PRIMARY, TEAM);
    script(
      CALENDARS,
      { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) },
      { body: eventsPage([meetFixture, declinedFixture], { nextSyncToken: 'team-1' }) },
    );
    await engine.runSource(sourceId);
    const linked = linkOf(TEAM, meetFixture.id)!.eventId!;
    await notes.createNote({ linkedEventId: linked });

    await choose(PRIMARY);
    // deselecting only flips the column: the events stay until a run
    expect(selected()).toEqual([PRIMARY]);
    expect(linkOf(TEAM, declinedFixture.id)!.state).toBe(LinkState.SYNCED);

    script(CALENDARS, { body: eventsPage([], { nextSyncToken: 'primary-2' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 2 });
    expect(linkOf(TEAM, declinedFixture.id)).toBeUndefined();
    expect(linkOf(TEAM, meetFixture.id)!.state).toBe(LinkState.REMOVED);
    expect(linkOf(PRIMARY, timedFixture.id)!.state).toBe(LinkState.SYNCED);
    expect((await visible()).map((event) => event.title)).toEqual(['Design review']);
    expect(eventRequests().map((request) => request.calendarId)).toEqual([PRIMARY]);
    // the team calendar's progress is forgotten
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'primary-2', pageToken: null } },
    });

    // picked again: a full pass, which restores the kept event
    await choose(PRIMARY, TEAM);
    script(
      CALENDARS,
      { body: eventsPage([], { nextSyncToken: 'primary-3' }) },
      { body: eventsPage([meetFixture], { nextSyncToken: 'team-2' }) },
    );
    await engine.runSource(sourceId);

    expect(eventRequests()[1]).toEqual({
      calendarId: TEAM,
      params: { ...FULL, timeMin: TIME_MIN },
    });
    expect(linkOf(TEAM, meetFixture.id)).toMatchObject({
      state: LinkState.SYNCED,
      eventId: linked,
    });
  });

  it("applies a deselection with the run's first page, so a run that fails before it changes nothing", async () => {
    await choose(PRIMARY, TEAM);
    script(
      CALENDARS,
      { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) },
      { body: eventsPage([meetFixture], { nextSyncToken: 'team-1' }) },
    );
    await engine.runSource(sourceId);
    await choose(PRIMARY);
    const before = sourceRow().cursor;

    // offline: the calendar listing fails, before any page
    script({ error: new TypeError('fetch failed') });
    const failed = await engine.runSource(sourceId);

    // nothing written: the events and the calendar's progress stay together
    expect(failed).toMatchObject({ outcome: SyncRunOutcome.FAILED, removed: 0 });
    expect(linkOf(TEAM, meetFixture.id)!.state).toBe(LinkState.SYNCED);
    expect(sourceRow().cursor).toEqual(before);

    // the next run that gets a page applies it, removal and dropped progress in one transaction
    script(CALENDARS, { body: eventsPage([], { nextSyncToken: 'primary-2' }) });
    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, removed: 1 });
    expect(linkOf(TEAM, meetFixture.id)).toBeUndefined();
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'primary-2', pageToken: null } },
    });
  });

  it('moves the integration to needs_reauth when listing calendars is refused', async () => {
    script({ status: 401, body: { error: { code: 401 } } });
    const result = await engine.runSource(sourceId);
    expect(result).toMatchObject({ outcome: SyncRunOutcome.FAILED });
    expect((await service.getById(integrationId)).status).toBe(IntegrationStatus.NEEDS_REAUTH);
  });
});

describe('Google Calendar sync — unsupported', () => {
  it('skips an events source whose provider serves no calendars', async () => {
    const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
    const bare = { ...createGoogleCalendarProvider({ fetch, client: null }), calendars: undefined };
    const providers: ProviderRegistry = new Map<ProviderId, Provider>([[bare.id, bare]]);
    const other = new SyncEngine(db, {
      integrations: service,
      syncState: new SyncStateManager(db),
      credentials,
      providers,
      writer,
      logger: LOGGER,
    });
    const result = await other.runSource(sourceId);
    expect(result).toMatchObject({
      outcome: SyncRunOutcome.SKIPPED,
      skipReason: SyncSkipReason.UNSUPPORTED,
    });
  });
});

describe('Google Calendar sync — abort', () => {
  it('cancels the calendar listing in flight on abort, writing nothing', async () => {
    script({ hang: true });
    const before = sourceRow();
    const controller = new AbortController();

    const running = engine.runSource(sourceId, { signal: controller.signal });
    await vi.waitFor(() => expect(fetch.requests).toHaveLength(1));
    controller.abort();

    // the request would otherwise wait for its 30-second timeout, past the test's own
    await expect(running).resolves.toMatchObject({ outcome: SyncRunOutcome.ABORTED, pages: 0 });
    expect(fetch.requests[0].signal?.aborted).toBe(true);
    expect(sourceRow()).toEqual(before);
  });

  it('cancels the events page in flight on abort, writing nothing', async () => {
    script(CALENDARS, { hang: true });
    const before = sourceRow();
    const controller = new AbortController();

    const running = engine.runSource(sourceId, { signal: controller.signal });
    await vi.waitFor(() => expect(fetch.requests).toHaveLength(2));
    controller.abort();

    await expect(running).resolves.toMatchObject({ outcome: SyncRunOutcome.ABORTED, pages: 0 });
    expect(fetch.requests[1].signal?.aborted).toBe(true);
    expect(sourceRow()).toEqual(before);
    expect(db.select().from(eventsTable).all()).toEqual([]);
  });
});
