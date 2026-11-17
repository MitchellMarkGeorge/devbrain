import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { CalendarId, ExternalSourceId, IntegrationId } from '@common/ids';
import { externalLinks } from '@main/db/schema/integrations';
import { calendars as calendarsTable } from '@main/db/schema/calendars';
import { events as eventsTable } from '@main/db/schema/events';
import { EventKind, EventStatus, Provider as ProviderId } from '@common/types';
import { createDb } from '../utils';
import { FakeCipher } from '../__mocks__/fake-cipher';
import {
  createFakeCalendarProvider,
  FAKE_ACCESS_TOKEN,
  FAKE_REFRESH_TOKEN,
  FakeCalendarProvider,
  fakeRegistry,
} from './fake-provider';
import { CredentialStore } from '../../integrations/credential-store';
import { IntegrationService } from '../../integrations/service';
import { OAuthClient } from '../../integrations/oauth/types';
import { ExternalCalendar, ExternalEvent } from '../../integrations/types';
import { CalendarService } from '../../calendars/service';
import { SearchService } from '../../search/service';
import { SyncEngine } from '../../sync/engine';
import { SyncStateManager } from '../../sync/sync-state';
import { SyncWriter } from '../../sync/writer';
import { calendarsToSync } from '../../sync/event-syncer';
import { EventCursor, withoutCalendar } from '../../sync/event-cursor';
import { SyncRunOutcome, SyncSkipReason } from '../../sync/types';
import { NotFoundError } from '../../shared/errors';

// The calendar picker's two operations outside a run (SyncEngine.refreshCalendars and
// deselectCalendar), wired as Workspace wires them, against the fake calendar provider.

const PRIMARY = 'ada@example.com';
const TEAM = 'team@example.com';
const team: ExternalCalendar = {
  id: TEAM,
  name: 'Team',
  primary: false,
  color: '#7986cb',
  timeZone: 'UTC',
};

let db: BetterSQLite3Database;
let workspacePath: string;
let google: FakeCalendarProvider;
let service: IntegrationService;
let syncState: SyncStateManager;
let engine: SyncEngine;
let calendarService: CalendarService;
let integrationId: IntegrationId;
let sourceId: ExternalSourceId;
let itemCount = 0;

function event(calendarId: string, overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  itemCount += 1;
  const start = new Date(Date.now() + itemCount * 60 * 60 * 1000);
  return {
    externalId: `${calendarId}:event-${itemCount}`,
    calendarId,
    url: `https://calendar.example.com/event-${itemCount}`,
    title: `Event ${itemCount}`,
    description: null,
    startAt: start,
    endAt: new Date(start.getTime() + 30 * 60 * 1000),
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
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function calendarRow(externalId: string) {
  return db.select().from(calendarsTable).where(eq(calendarsTable.externalId, externalId)).get();
}

function eventTitlesIn(calendarId: CalendarId): string[] {
  return db
    .select({ title: eventsTable.title })
    .from(eventsTable)
    .where(eq(eventsTable.calendarId, calendarId))
    .all()
    .map((row) => row.title)
    .sort();
}

function cursor(): EventCursor {
  return syncState.getSyncTarget(sourceId).cursor as EventCursor;
}

async function run() {
  const result = await engine.runSource(sourceId);
  expect(result.outcome).toBe(SyncRunOutcome.COMPLETED);
  return result;
}

beforeEach(async () => {
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-calendar-picker-'));
  db = createDb();
  google = createFakeCalendarProvider();
  const oauth: OAuthClient = {
    authorize: async (config) => ({
      accessToken: FAKE_ACCESS_TOKEN,
      refreshToken: FAKE_REFRESH_TOKEN,
      expiresAt: null,
      scopes: config.scopes,
    }),
    refresh: async () => {
      throw new Error('not refreshed in these tests');
    },
    revoke: async () => {},
  };
  const credentials = new CredentialStore(db, { cipher: new FakeCipher() });
  service = new IntegrationService(db, { credentials, providers: fakeRegistry(google), oauth });
  syncState = new SyncStateManager(db);
  const writer = new SyncWriter(db, new SearchService(db, workspacePath));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  engine = new SyncEngine(db, { integrations: service, syncState, writer, logger });
  // as Workspace wires them
  calendarService = new CalendarService(db, async (id) => {
    const result = await engine.refreshCalendars(id);
    return result.ok && result.value !== null && result.value.changed.length > 0;
  });
  calendarService.onChange((change) => {
    if (change.type !== 'selection_changed') return;
    const { id, sourceId: source, selected } = change.calendar;
    if (source !== null && !selected) engine.deselectCalendar(source, id);
  });

  const integration = await service.connectWithOAuth(ProviderId.GOOGLE_CALENDAR);
  integrationId = integration.id;
  sourceId = integration.sources[0].id;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SyncEngine.refreshCalendars', () => {
  it("stores the source's calendars without pulling events, the first listing selecting the primary", async () => {
    google.calendars.calendars.push(team);

    const result = await engine.refreshCalendars(sourceId);

    expect(result).toMatchObject({ ok: true, value: { changed: ['calendar'] } });
    expect(google.calendars.pulls).toEqual([]);
    expect(calendarRow(PRIMARY)).toMatchObject({ name: 'Ada', selected: true });
    expect(calendarRow(TEAM)).toMatchObject({ name: 'Team', selected: false });
    // the source's cursor and status are a run's, and untouched
    expect(syncState.getSyncTarget(sourceId)).toMatchObject({
      cursor: null,
      initialSyncCompletedAt: null,
    });
  });

  it('picks up a renamed calendar and reports nothing when nothing changed', async () => {
    await run();
    google.calendars.calendars[0] = { ...google.calendars.calendars[0], name: 'Ada Lovelace' };

    expect(await calendarService.refresh(sourceId)).toMatchObject([{ name: 'Ada Lovelace' }]);
    const changes: string[] = [];
    calendarService.onChange((change) => changes.push(change.type));
    await calendarService.refresh(sourceId);
    expect(changes).toEqual([]);
  });

  it('lists nothing while the integration needs reauth or is disabled', async () => {
    const list = vi.spyOn(google.calendars, 'listCalendars');
    service.markNeedsReauth(integrationId);
    expect(await engine.refreshCalendars(sourceId)).toEqual({
      ok: false,
      reason: SyncSkipReason.NEEDS_REAUTH,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('passes a provider failure on, writing nothing', async () => {
    vi.spyOn(google.calendars, 'listCalendars').mockRejectedValueOnce(new Error('offline'));
    await expect(calendarService.refresh(sourceId)).rejects.toThrow('offline');
    expect(calendarRow(PRIMARY)).toBeUndefined();
  });
});

describe('SyncEngine.deselectCalendar', () => {
  beforeEach(async () => {
    google.calendars.calendars.push(team);
    await engine.refreshCalendars(sourceId);
    calendarService.setSelected(calendarRow(TEAM)!.id, true);
    google.calendars.events.set(PRIMARY, [event(PRIMARY, { title: 'Standup' })]);
    google.calendars.events.set(TEAM, [event(TEAM, { title: 'Planning' })]);
    await run();
  });

  it("removes the calendar's events and its progress at once, without asking the provider", async () => {
    const teamRow = calendarRow(TEAM)!;
    expect(eventTitlesIn(teamRow.id)).toEqual(['Planning']);
    expect(Object.keys(cursor().calendars).sort()).toEqual([PRIMARY, TEAM]);
    const list = vi.spyOn(google.calendars, 'listCalendars');
    // offline, and needing reauth: neither matters
    service.markNeedsReauth(integrationId);

    calendarService.setSelected(teamRow.id, false);

    expect(eventTitlesIn(teamRow.id)).toEqual([]);
    expect(Object.keys(cursor().calendars)).toEqual([PRIMARY]);
    expect(eventTitlesIn(calendarRow(PRIMARY)!.id)).toEqual(['Standup']);
    expect(list).not.toHaveBeenCalled();
  });

  it('selecting it again is a full pass that brings its events back', async () => {
    const teamRow = calendarRow(TEAM)!;
    calendarService.setSelected(teamRow.id, false);
    calendarService.setSelected(teamRow.id, true);
    const pulls = google.calendars.pulls.length;

    await run();

    expect(eventTitlesIn(teamRow.id)).toEqual(['Planning']);
    expect(google.calendars.pulls.slice(pulls)).toContainEqual({
      calendarId: TEAM,
      query: { from: expect.any(String) },
    });
  });

  it('leaves a run that started before it from writing the calendar again', async () => {
    const teamRow = calendarRow(TEAM)!;
    google.calendars.events.set(TEAM, [event(TEAM, { title: 'Retro' })]);
    // the run lists its calendars, then the user deselects one before its page is applied
    const getEventPage = google.calendars.getEventPage.bind(google.calendars);
    vi.spyOn(google.calendars, 'getEventPage').mockImplementation(async (...args) => {
      if (args[1] === TEAM) calendarService.setSelected(teamRow.id, false);
      return getEventPage(...args);
    });

    await run();

    expect(eventTitlesIn(teamRow.id)).toEqual([]);
    expect(eventTitlesIn(calendarRow(PRIMARY)!.id)).toEqual(['Standup']);
    // the run kept no progress for it, so selecting it again is a full pass
    expect(Object.keys(cursor().calendars)).toEqual([PRIMARY]);
    vi.mocked(google.calendars.getEventPage).mockRestore();
    calendarService.setSelected(teamRow.id, true);
    await run();
    expect(eventTitlesIn(teamRow.id)).toEqual(['Retro']);
  });

  it("refuses a calendar that is not one of the source's", () => {
    expect(() => engine.deselectCalendar(sourceId, 'cal_unknown' as CalendarId)).toThrow(
      NotFoundError,
    );
  });

  it('deletes the events nothing links to, with their links', async () => {
    const teamRow = calendarRow(TEAM)!;
    calendarService.setSelected(teamRow.id, false);
    const links = db
      .select()
      .from(externalLinks)
      .where(eq(externalLinks.sourceId, sourceId))
      .all()
      .filter((link) => link.externalId.startsWith(TEAM));
    // nothing linked to it, so it was deleted with its link
    expect(links).toEqual([]);
  });
});

describe('calendarsToSync', () => {
  const primary: ExternalCalendar = { ...team, id: PRIMARY, name: 'Ada', primary: true };

  it('syncs the primary on a first listing, then only the selected ones, primary first', () => {
    const zed = { ...team, id: 'zed', name: 'Zed' };
    expect(calendarsToSync([team, primary], []).map((calendar) => calendar.id)).toEqual([PRIMARY]);
    expect(
      calendarsToSync(
        [zed, team, primary],
        [
          { externalId: PRIMARY, selected: true },
          { externalId: TEAM, selected: true },
          { externalId: 'zed', selected: false },
        ],
      ).map((calendar) => calendar.id),
    ).toEqual([PRIMARY, TEAM]);
  });

  it('leaves out a new calendar once the source has rows, and a selected one no longer listed', () => {
    expect(
      calendarsToSync(
        [primary, team],
        [
          { externalId: PRIMARY, selected: true },
          { externalId: 'gone', selected: true },
        ],
      ).map((calendar) => calendar.id),
    ).toEqual([PRIMARY]);
  });
});

describe('withoutCalendar', () => {
  it("drops the calendar's progress and its place in a run", () => {
    const state = { syncToken: 't', pageToken: null };
    expect(
      withoutCalendar({ calendars: { a: state, b: state }, pending: ['b', 'a'] }, 'b'),
    ).toEqual({ calendars: { a: state }, pending: ['a'] });
    expect(withoutCalendar({ calendars: { a: state } }, 'a')).toEqual({ calendars: {} });
  });
});
