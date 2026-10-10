import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
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
import { IntegrationChange, IntegrationService } from '../../integrations/service';
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
import { DEFAULT_CALENDAR_ID } from '../../calendars/types';
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
let events: EventService;
let notes: NoteService;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let changes: IntegrationChange[];
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
// stores no calendars. Setup then lists them, as the calendar picker would, which selects the
// primary one, so every test starts with the calendar rows in place.
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
  const writer = new SyncWriter(db, search);
  service = new IntegrationService(db, { credentials, providers, oauth, writer });
  engine = new SyncEngine(db, {
    integrations: service,
    credentials,
    providers,
    writer,
    logger: LOGGER,
    now: () => NOW,
  });
  events = new EventService(db);
  notes = new NoteService(db, workspacePath);

  const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
  integrationId = integration.id;
  sourceId = integration.sources[0].id;
  connectRequests = fetch.requests.map((request) => request.url.pathname);
  calendarsAfterConnect = calendarRows().length;
  await service.listCalendars(sourceId);
  changes = [];
  service.onChange((change) => changes.push(change));
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

function selected(): string[] {
  return service.selectedCalendarExternalIds(sourceId);
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
    await service.setCalendars(sourceId, [calendarIdOf(PRIMARY), calendarIdOf(TEAM)]);
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

  it('lists the calendars as rows, refreshed from the provider, marking the selected ones', async () => {
    db.update(calendars).set({ name: 'Stale name' }).where(eq(calendars.externalId, TEAM)).run();
    script(CALENDARS);

    const listed = await service.listCalendars(sourceId);

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

  it('syncs only an added calendar fully, and says so to listeners', async () => {
    script(CALENDARS, { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) });
    await engine.runSource(sourceId);

    changes.length = 0;
    await service.setCalendars(sourceId, [calendarIdOf(PRIMARY), calendarIdOf(TEAM)]);
    expect(changes).toEqual([
      {
        type: 'calendars_changed',
        integrationId,
        sourceId,
        added: [calendarIdOf(TEAM)],
        removed: [],
      },
    ]);
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

  it('removes only the unlinked events of a deselected calendar, and resyncs it fully if picked again', async () => {
    const both = [calendarIdOf(PRIMARY), calendarIdOf(TEAM)];
    await service.setCalendars(sourceId, both);
    script(
      CALENDARS,
      { body: eventsPage([timedFixture], { nextSyncToken: 'primary-1' }) },
      { body: eventsPage([meetFixture, declinedFixture], { nextSyncToken: 'team-1' }) },
    );
    await engine.runSource(sourceId);
    const linked = linkOf(TEAM, meetFixture.id)!.eventId!;
    await notes.createNote({ linkedEventId: linked });

    await service.setCalendars(sourceId, [calendarIdOf(PRIMARY)]);

    expect(linkOf(TEAM, declinedFixture.id)).toBeUndefined();
    expect(linkOf(TEAM, meetFixture.id)!.state).toBe(LinkState.REMOVED);
    expect(linkOf(PRIMARY, timedFixture.id)!.state).toBe(LinkState.SYNCED);
    expect((await visible()).map((event) => event.title)).toEqual(['Design review']);
    expect(sourceRow().cursor).toEqual({
      calendars: { [PRIMARY]: { syncToken: 'primary-1', pageToken: null } },
    });
    // the deselected calendar keeps its row, unselected
    expect(selected()).toEqual([PRIMARY]);

    // picked again: a full pass, which restores the kept event
    await service.setCalendars(sourceId, both);
    script(
      CALENDARS,
      { body: eventsPage([], { nextSyncToken: 'primary-2' }) },
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

  it('ends a run without writing a page that arrived after the selection changed', async () => {
    script(CALENDARS, () => {
      // the user deselects the calendar while its page is in flight
      void service.setCalendars(sourceId, []);
      return Response.json(eventsPage([timedFixture], { nextSyncToken: 'sync-1' }));
    });

    const result = await engine.runSource(sourceId);

    expect(result).toMatchObject({ outcome: SyncRunOutcome.COMPLETED, pages: 0 });
    expect(eventCount()).toBe(0);
    expect(sourceRow().cursor).toBeNull();
    expect(selected()).toEqual([]);
  });

  it('does nothing when the selection is unchanged', async () => {
    const before = sourceRow();
    await service.setCalendars(sourceId, [calendarIdOf(PRIMARY), calendarIdOf(PRIMARY)]);
    expect(sourceRow()).toEqual(before);
    expect(changes).toEqual([]);
  });

  it("refuses a calendar that is not the source's", async () => {
    await expect(service.setCalendars(sourceId, [DEFAULT_CALENDAR_ID])).rejects.toThrow(
      'has no calendar',
    );
    expect(selected()).toEqual([PRIMARY]);
  });

  it('refuses a source that is not an events source', async () => {
    db.update(externalSources)
      .set({ sourceType: SourceType.TASKS })
      .where(eq(externalSources.id, sourceId))
      .run();
    await expect(service.setCalendars(sourceId, [])).rejects.toThrow('not an events source');
    await expect(service.listCalendars(sourceId)).rejects.toThrow('not an events source');
  });

  it('refuses to deselect without a sync writer, changing nothing', async () => {
    const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
    const providers: ProviderRegistry = new Map<ProviderId, Provider>([
      [ProviderId.GOOGLE_CALENDAR, createGoogleCalendarProvider({ fetch, client: null })],
    ]);
    const withoutWriter = new IntegrationService(db, { credentials, providers });
    await expect(withoutWriter.setCalendars(sourceId, [])).rejects.toThrow('No sync writer');
    expect(selected()).toEqual([PRIMARY]);
  });

  it('moves the integration to needs_reauth when listing calendars is refused', async () => {
    script({ status: 401, body: { error: { code: 401 } } });
    await expect(service.listCalendars(sourceId)).rejects.toThrow('rejected the credentials');
    expect((await service.getById(integrationId)).status).toBe(IntegrationStatus.NEEDS_REAUTH);
  });
});

describe('Google Calendar sync — unsupported', () => {
  it('skips an events source whose provider serves no events', async () => {
    const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
    const bare = { ...createGoogleCalendarProvider({ fetch, client: null }), events: undefined };
    const providers: ProviderRegistry = new Map<ProviderId, Provider>([[bare.id, bare]]);
    const other = new SyncEngine(db, {
      integrations: service,
      credentials,
      providers,
      writer: new SyncWriter(db, new SearchService(db, workspacePath)),
      logger: LOGGER,
    });
    const result = await other.runSource(sourceId);
    expect(result).toMatchObject({
      outcome: SyncRunOutcome.SKIPPED,
      skipReason: SyncSkipReason.UNSUPPORTED,
    });
  });
});
