import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { CalendarId, EventId, ExternalSourceId, generateId } from '@common/ids';
import {
  externalEventExceptions,
  externalLinks,
  externalSources,
  integrations,
} from '@main/db/schema/integrations';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events as eventsTable } from '@main/db/schema/events';
import { createDb } from '../utils';
import { SyncWriter } from '../../sync/writer';
import { EventPageItems } from '../../sync/types';
import { SearchService } from '../../search/service';
import { EventService } from '../../events/service';
import { NoteService } from '../../notes/service';
import { TaskService } from '../../tasks/service';
import { EventKind, EventResponse, EventStatus } from '../../events/types';
import {
  AuthType,
  ExternalCalendar,
  ExternalEvent,
  LinkState,
  Provider,
  SourceType,
} from '../../integrations/types';
import { ExternalReadOnlyError, NotFoundError } from '../../shared/errors';

const CALENDAR: ExternalCalendar = {
  id: 'ada@example.com',
  name: 'ada@example.com',
  primary: true,
  color: '#9fe1e7',
  timeZone: 'America/New_York',
};
const OTHER_CALENDAR: ExternalCalendar = {
  id: 'team@group.calendar.google.com',
  name: 'Team',
  primary: false,
  color: '#42d692',
  timeZone: 'Europe/London',
};
const CREATED = new Date('2026-09-01T12:00:00Z');
const V1 = new Date('2026-10-01T12:00:00Z');
const V2 = new Date('2026-10-02T12:00:00Z');
// Mondays at 14:00 UTC
const SERIES_START = new Date('2026-10-05T14:00:00Z');
const OCCURRENCE_2 = new Date('2026-10-12T14:00:00Z');
const OCCURRENCE_3 = new Date('2026-10-19T14:00:00Z');
const WEEKLY = 'RRULE:FREQ=WEEKLY;BYDAY=MO';
const RANGE: [Date, Date] = [new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z')];

let db: BetterSQLite3Database;
let search: SearchService;
let writer: SyncWriter;
let events: EventService;
let notes: NoteService;
let tasks: TaskService;
let workspacePath: string;
let sourceId: ExternalSourceId;
// the row of CALENDAR, which the pages are applied to
let calendarId: CalendarId;
let itemCount = 0;

// an event as the mapper hands it over
function event(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  itemCount += 1;
  const calendarId = overrides.calendarId ?? CALENDAR.id;
  return {
    externalId: `${calendarId}:event-${itemCount}`,
    calendarId,
    url: `https://www.google.com/calendar/event?eid=${itemCount}`,
    title: `Event ${itemCount}`,
    description: null,
    startAt: new Date('2026-10-12T15:00:00Z'),
    endAt: new Date('2026-10-12T16:00:00Z'),
    allDay: false,
    startDate: null,
    endDate: null,
    timeZone: 'America/New_York',
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
    createdAt: CREATED,
    updatedAt: V1,
    ...overrides,
  };
}

function master(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return event({
    title: 'Weekly sync',
    startAt: SERIES_START,
    endAt: new Date(SERIES_START.getTime() + 30 * 60_000),
    recurrenceRule: WEEKLY,
    ...overrides,
  });
}

// a moved (or, with cancelled set, a cancelled) occurrence of `series`
function occurrenceOf(
  series: ExternalEvent,
  originalStartAt: Date,
  overrides: Partial<ExternalEvent> = {},
): ExternalEvent {
  return event({
    externalId: `${series.externalId}_${originalStartAt.toISOString()}`,
    calendarId: series.calendarId,
    title: `${series.title} (moved)`,
    recurringEventExternalId: series.externalId,
    originalStartAt,
    ...overrides,
  });
}

function page(items: Partial<EventPageItems>): EventPageItems {
  return { events: [], cancelledIds: [], skippedIds: [], fullPass: null, ...items };
}

function linkOf(externalId: string) {
  return db
    .select()
    .from(externalLinks)
    .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, externalId)))
    .get();
}

function eventIdOf(externalId: string): EventId {
  return linkOf(externalId)!.eventId!;
}

function eventRow(externalId: string) {
  return db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, eventIdOf(externalId)))
    .get()!;
}

function calendarRow(externalId: string) {
  return db
    .select()
    .from(calendars)
    .where(and(eq(calendars.sourceId, sourceId), eq(calendars.externalId, externalId)))
    .get();
}

async function exdatesOf(externalId: string): Promise<Date[]> {
  return events.getById(eventIdOf(externalId)).exdates!;
}

function count(
  table:
    | typeof eventsTable
    | typeof externalLinks
    | typeof eventExceptions
    | typeof externalEventExceptions,
) {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .get()!.n;
}

function searchIds(query: string): string[] {
  return search.search({ query, entityType: [] }).map((result) => result.entityId);
}

// the index's entries for synced rows, as rebuilding must reproduce them; notes are left out, since
// these tests write them through NoteService with no workspace to index them
function syncedEntries() {
  return db.all(
    sql`SELECT entity_id, entity_type, title, body FROM search_index WHERE entity_type != 'note' ORDER BY entity_id`,
  );
}

async function visibleTitles(): Promise<string[]> {
  return events
    .listForCalendar(...RANGE)
    .map((item) => item.title)
    .sort();
}

beforeEach(async () => {
  db = createDb();
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-event-writer-'));
  search = new SearchService(db, workspacePath);
  writer = new SyncWriter(db, search);
  events = new EventService(db);
  notes = new NoteService(db, workspacePath);
  tasks = new TaskService(db);
  const integrationId = db
    .insert(integrations)
    .values({
      provider: Provider.GOOGLE_CALENDAR,
      authType: AuthType.OAUTH,
      accountId: 'subject-1',
      accountLabel: CALENDAR.id,
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.EVENTS })
    .returning()
    .get().id;
  // selected, as IntegrationService's first listing stores the primary calendar
  calendarId = db
    .insert(calendars)
    .values({ sourceId, externalId: CALENDAR.id, name: CALENDAR.name, isPrimary: true })
    .returning()
    .get().id;
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('SyncWriter events — insert and update', () => {
  it('inserts an event into its calendar, with every column, its link and its search entry', () => {
    const item = event({
      title: 'Design review',
      description: '**Agenda**',
      location: 'Room 4',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      color: '#dc2127',
      status: EventStatus.TENTATIVE,
      response: EventResponse.DECLINED,
      kind: EventKind.FOCUS_TIME,
    });

    const summary = writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));

    expect(summary).toEqual({
      inserted: 1,
      updated: 0,
      removed: 0,
      changed: ['event'],
    });
    expect(eventRow(item.externalId)).toMatchObject({
      calendarId,
      title: 'Design review',
      description: '**Agenda**',
      startAt: item.startAt,
      endAt: item.endAt,
      allDay: false,
      startDate: null,
      endDate: null,
      timeZone: 'America/New_York',
      location: 'Room 4',
      recurrenceRule: null,
      seriesId: null,
      originalStartAt: null,
      status: EventStatus.TENTATIVE,
      response: EventResponse.DECLINED,
      kind: EventKind.FOCUS_TIME,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      color: '#dc2127',
      createdAt: CREATED,
    });
    expect(linkOf(item.externalId)).toMatchObject({
      provider: Provider.GOOGLE_CALENDAR,
      state: LinkState.SYNCED,
      externalKey: null,
      externalUrl: item.url,
      externalUpdatedAt: V1,
      metadata: { calendarId: CALENDAR.id, recurringEventExternalId: null },
    });
    expect(searchIds('Design')).toEqual([eventIdOf(item.externalId)]);
  });

  it("leaves the calendar's row alone: the run's listing keeps it current", () => {
    const before = calendarRow(CALENDAR.id);
    writer.applyEventPage(sourceId, calendarId, page({ events: [event()] }));
    expect(calendarRow(CALENDAR.id)).toEqual(before);
  });

  it('stores an all-day event with its dates, and their local midnights', () => {
    const item = event({
      allDay: true,
      startDate: '2026-10-14',
      endDate: '2026-10-15',
      startAt: new Date(2026, 9, 14),
      endAt: new Date(2026, 9, 15),
    });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    expect(eventRow(item.externalId)).toMatchObject({
      allDay: true,
      startDate: '2026-10-14',
      endDate: '2026-10-15',
      startAt: new Date(2026, 9, 14),
    });
  });

  it('gives an all-day event from a provider that sent no dates the days of its instants', () => {
    const item = event({
      allDay: true,
      startAt: new Date(2026, 9, 14),
      endAt: new Date(2026, 9, 15),
    });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    expect(eventRow(item.externalId)).toMatchObject({
      startDate: '2026-10-14',
      endDate: '2026-10-15',
    });
  });

  it('only touches an unchanged event', () => {
    const item = event();
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    const before = eventRow(item.externalId);

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [{ ...item, title: 'Stale' }] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: [] });
    expect(eventRow(item.externalId)).toEqual(before);
  });

  it('updates a changed event and re-indexes it', () => {
    const item = event({ title: 'Planning' });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({
        events: [{ ...item, title: 'Retro', response: EventResponse.ACCEPTED, updatedAt: V2 }],
      }),
    );

    expect(summary).toMatchObject({ inserted: 0, updated: 1, changed: ['event'] });
    expect(eventRow(item.externalId)).toMatchObject({
      title: 'Retro',
      response: EventResponse.ACCEPTED,
    });
    expect(searchIds('Retro')).toEqual([eventIdOf(item.externalId)]);
    expect(searchIds('Planning')).toEqual([]);
    expect(count(eventsTable)).toBe(1);
  });

  it('leaves the fields DevBrain owns alone: a note linked to the event stays linked', async () => {
    const item = event();
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    const note = await notes.createNote({ linkedEventId: eventIdOf(item.externalId) });

    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [{ ...item, title: 'New', updatedAt: V2 }] }),
    );

    expect(notes.getById(note.id).linkedEventId).toBe(eventIdOf(item.externalId));
  });

  it('fails on an unknown source and writes nothing', () => {
    expect(() =>
      writer.applyEventPage(generateId('externalSource'), calendarId, page({ events: [event()] })),
    ).toThrow(NotFoundError);
    expect(count(eventsTable)).toBe(0);
  });
});

describe('SyncWriter events — read-only', () => {
  it('lets the service neither update nor delete a synced event', async () => {
    const item = event();
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    const id = eventIdOf(item.externalId);

    expect(() => events.updateEvent(id, { title: 'Mine now' })).toThrow(ExternalReadOnlyError);
    expect(() => events.deleteEvent(id)).toThrow(ExternalReadOnlyError);
  });
});

describe('SyncWriter events — recurring series', () => {
  it('stores a series rule exactly as the provider sent it', () => {
    const series = master({ recurrenceRule: `${WEEKLY}\nRDATE:20261231T140000Z` });
    writer.applyEventPage(sourceId, calendarId, page({ events: [series] }));
    expect(eventRow(series.externalId).recurrenceRule).toBe(`${WEEKLY}\nRDATE:20261231T140000Z`);
  });

  it('records a cancelled occurrence against its series, leaving the rule alone', async () => {
    const series = master();
    writer.applyEventPage(sourceId, calendarId, page({ events: [series] }));

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [occurrenceOf(series, OCCURRENCE_3, { cancelled: true })] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 1, removed: 0, changed: ['event'] });
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_3]);
    expect(eventRow(series.externalId).recurrenceRule).toBe(WEEKLY);
    // the cancelled occurrence gets no row of its own
    expect(count(eventsTable)).toBe(1);
  });

  it('gives a moved occurrence its own row in its series, excluded from the series', async () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2, {
      startAt: new Date('2026-10-13T14:00:00Z'),
      endAt: new Date('2026-10-13T14:30:00Z'),
    });

    writer.applyEventPage(sourceId, calendarId, page({ events: [series] }));
    writer.applyEventPage(sourceId, calendarId, page({ events: [moved] }));

    expect(eventRow(moved.externalId)).toMatchObject({
      title: 'Weekly sync (moved)',
      startAt: new Date('2026-10-13T14:00:00Z'),
      recurrenceRule: null,
      seriesId: eventIdOf(series.externalId),
      originalStartAt: OCCURRENCE_2,
    });
    expect(linkOf(moved.externalId)!.metadata).toMatchObject({
      recurringEventExternalId: series.externalId,
    });
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_2]);
    expect(await visibleTitles()).toEqual(['Weekly sync', 'Weekly sync (moved)']);
  });

  it('parks what arrives before its series, and hands it over when the series arrives', async () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [occurrenceOf(series, OCCURRENCE_3, { cancelled: true }), moved] }),
    );
    expect(count(externalEventExceptions)).toBe(1);
    expect(eventRow(moved.externalId).seriesId).toBeNull();

    writer.applyEventPage(sourceId, calendarId, page({ events: [series] }));

    expect(count(externalEventExceptions)).toBe(0);
    expect(eventRow(moved.externalId).seriesId).toBe(eventIdOf(series.externalId));
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_2, OCCURRENCE_3]);
  });

  it('puts an occurrence listed before its series in the same page into it', () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(sourceId, calendarId, page({ events: [moved, series] }));
    expect(eventRow(moved.externalId).seriesId).toBe(eventIdOf(series.externalId));
  });

  it('a changed occurrence moves into a series that is new in the same page', () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(sourceId, calendarId, page({ events: [moved] }));

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [{ ...moved, title: 'Moved again', updatedAt: V2 }, series] }),
    );

    // the new master is inserted before the occurrence is updated to point at it
    expect(summary).toMatchObject({ inserted: 1, updated: 1 });
    expect(eventRow(moved.externalId)).toMatchObject({
      title: 'Moved again',
      seriesId: eventIdOf(series.externalId),
    });
  });

  it('adopts the occurrences of several series arriving in one page', async () => {
    const first = master();
    const second = master({ title: 'Standup' });
    const waiting = [
      occurrenceOf(first, OCCURRENCE_2),
      occurrenceOf(first, OCCURRENCE_3, { cancelled: true }),
      occurrenceOf(second, OCCURRENCE_2, { cancelled: true }),
      occurrenceOf(second, OCCURRENCE_3),
    ];
    writer.applyEventPage(sourceId, calendarId, page({ events: waiting }));
    expect(count(externalEventExceptions)).toBe(2);

    writer.applyEventPage(sourceId, calendarId, page({ events: [first, second] }));

    expect(count(externalEventExceptions)).toBe(0);
    expect(eventRow(waiting[0].externalId).seriesId).toBe(eventIdOf(first.externalId));
    expect(eventRow(waiting[3].externalId).seriesId).toBe(eventIdOf(second.externalId));
    expect(await exdatesOf(first.externalId)).toEqual([OCCURRENCE_2, OCCURRENCE_3]);
    expect(await exdatesOf(second.externalId)).toEqual([OCCURRENCE_2, OCCURRENCE_3]);
  });

  it('keeps what a series no longer has when its rule changes', async () => {
    const series = master();
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [series, occurrenceOf(series, OCCURRENCE_3, { cancelled: true })] }),
    );

    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [{ ...series, recurrenceRule: `${WEEKLY};COUNT=10`, updatedAt: V2 }] }),
    );

    expect(eventRow(series.externalId).recurrenceRule).toBe(`${WEEKLY};COUNT=10`);
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_3]);
  });

  it('records nothing twice when the same page comes again, e.g. after a full resync', async () => {
    const series = master();
    const items = [
      series,
      occurrenceOf(series, OCCURRENCE_2),
      occurrenceOf(series, OCCURRENCE_3, { cancelled: true }),
    ];
    writer.applyEventPage(sourceId, calendarId, page({ events: items }));

    const summary = writer.applyEventPage(sourceId, calendarId, page({ events: items }));

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: [] });
    expect(count(eventExceptions)).toBe(1);
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_2, OCCURRENCE_3]);
  });

  it('removes a moved occurrence that is then cancelled, keeping it out of the series', async () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(sourceId, calendarId, page({ events: [series, moved] }));

    writer.applyEventPage(sourceId, calendarId, page({ events: [{ ...moved, cancelled: true }] }));

    expect(linkOf(moved.externalId)).toBeUndefined();
    expect(await exdatesOf(series.externalId)).toEqual([OCCURRENCE_2]);
  });

  it('removes a cancelled series with its occurrence rows and what it recorded', () => {
    const series = master();
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({
        events: [
          series,
          occurrenceOf(series, OCCURRENCE_2),
          occurrenceOf(series, OCCURRENCE_3, { cancelled: true }),
        ],
      }),
    );

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ cancelledIds: [series.externalId] }),
    );

    expect(summary).toMatchObject({ removed: 2, changed: ['event'] });
    expect(count(eventsTable)).toBe(0);
    expect(count(eventExceptions)).toBe(0);
  });

  it('forgets what was parked for a series that is cancelled before it arrives', () => {
    const series = master();
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [occurrenceOf(series, OCCURRENCE_3, { cancelled: true })] }),
    );
    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [series.externalId] }));
    expect(count(externalEventExceptions)).toBe(0);
  });

  it('keeps an occurrence a note links to as a one-off when its series goes', async () => {
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(sourceId, calendarId, page({ events: [series, moved] }));
    await notes.createNote({ linkedEventId: eventIdOf(moved.externalId) });

    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [series.externalId] }));

    expect(linkOf(moved.externalId)!.state).toBe(LinkState.REMOVED);
    expect(eventRow(moved.externalId).seriesId).toBeNull();
  });
});

describe('SyncWriter events — search rebuild', () => {
  it('rebuilding gives the index sync left: live, updated, cancelled and kept-for-a-note', async () => {
    const live = event({ title: 'Design review', description: 'Agenda' });
    const updated = event({ title: 'Standup' });
    const cancelled = event({ title: 'Lunch' });
    const linked = event({ title: 'Interview' });
    const series = master();
    const moved = occurrenceOf(series, OCCURRENCE_2);
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [live, updated, cancelled, linked, series, moved] }),
    );
    await notes.createNote({ linkedEventId: eventIdOf(linked.externalId) });
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({
        events: [{ ...updated, title: 'Standup moved', updatedAt: V2 }],
        cancelledIds: [cancelled.externalId, linked.externalId],
      }),
    );
    // kept for its note, but no longer searchable
    expect(linkOf(linked.externalId)!.state).toBe(LinkState.REMOVED);
    const synced = syncedEntries();
    expect(synced).toHaveLength(4);

    await search.rebuild();

    expect(syncedEntries()).toEqual(synced);
  });
});

describe('SyncWriter events — removal', () => {
  it('deletes a cancelled event nothing links to, and drops it from search', () => {
    const item = event({ title: 'Lunch' });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ cancelledIds: [item.externalId] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 1, changed: ['event'] });
    expect(count(eventsTable)).toBe(0);
    expect(count(externalLinks)).toBe(0);
    expect(searchIds('Lunch')).toEqual([]);
  });

  it('keeps a cancelled event a note links to: hidden from the calendar, resolvable by id', async () => {
    const item = event({ title: 'Kickoff' });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    const id = eventIdOf(item.externalId);
    const note = await notes.createNote({ title: 'Kickoff notes', linkedEventId: id });

    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [item.externalId] }));

    expect(linkOf(item.externalId)).toMatchObject({ state: LinkState.REMOVED });
    expect(linkOf(item.externalId)!.removedAt).not.toBeNull();
    expect(await visibleTitles()).toEqual([]);
    expect(events.getById(id)).toMatchObject({
      title: 'Kickoff',
      external: { state: LinkState.REMOVED },
    });
    expect(notes.getById(note.id).linkedEventId).toBe(id);
    // out of search, like any event out of scope
    expect(searchIds('Kickoff')).not.toContain(id);
  });

  it('keeps a cancelled event a task links to', async () => {
    const item = event();
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    tasks.createTask({
      title: 'Follow up',
      dueDate: new Date('2026-10-20T00:00:00Z'),
      linkedEventId: eventIdOf(item.externalId),
    });

    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [item.externalId] }));

    expect(linkOf(item.externalId)!.state).toBe(LinkState.REMOVED);
  });

  it('restores a kept event that comes back', async () => {
    const item = event({ title: 'Kickoff' });
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    await notes.createNote({ linkedEventId: eventIdOf(item.externalId) });
    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [item.externalId] }));

    // the same updatedAt: a removed link is restored whatever the time says
    const summary = writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));

    expect(summary).toMatchObject({ updated: 1 });
    expect(linkOf(item.externalId)).toMatchObject({ state: LinkState.SYNCED, removedAt: null });
    expect(await visibleTitles()).toEqual(['Kickoff']);
  });

  it('ignores ids it does not mirror, and ones already removed', async () => {
    const item = event();
    writer.applyEventPage(sourceId, calendarId, page({ events: [item] }));
    await notes.createNote({ linkedEventId: eventIdOf(item.externalId) });
    writer.applyEventPage(sourceId, calendarId, page({ cancelledIds: [item.externalId] }));

    const summary = writer.applyEventPage(
      sourceId,
      calendarId,
      page({ cancelledIds: [item.externalId, `${CALENDAR.id}:never-seen`] }),
    );

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: [] });
  });
});

describe('SyncWriter events — removeCalendarEvents', () => {
  it("removes one calendar's events by the removal rule, and forgets what was parked for it", async () => {
    const lunch = event({ title: 'Lunch' });
    const kickoff = event({ title: 'Kickoff' });
    const series = master();
    const standup = event({ calendarId: OTHER_CALENDAR.id, title: 'Standup' });
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({
        events: [lunch, kickoff, series, occurrenceOf(master(), OCCURRENCE_3, { cancelled: true })],
      }),
    );
    const otherId = db
      .insert(calendars)
      .values({ sourceId, externalId: OTHER_CALENDAR.id, name: OTHER_CALENDAR.name })
      .returning()
      .get().id;
    writer.applyEventPage(sourceId, otherId, page({ events: [standup] }));
    await notes.createNote({ linkedEventId: eventIdOf(kickoff.externalId) });
    expect(count(externalEventExceptions)).toBe(1);

    const summary = writer.removeCalendarEvents(sourceId, calendarId);

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 3, changed: ['event'] });
    expect(linkOf(lunch.externalId)).toBeUndefined();
    expect(linkOf(series.externalId)).toBeUndefined();
    expect(linkOf(kickoff.externalId)!.state).toBe(LinkState.REMOVED);
    expect(linkOf(standup.externalId)!.state).toBe(LinkState.SYNCED);
    expect(count(externalEventExceptions)).toBe(0);
    expect(await visibleTitles()).toEqual(['Standup']);
  });

  it("refuses a calendar that is not this source's", () => {
    expect(() => writer.removeCalendarEvents(sourceId, 'cal_default' as CalendarId)).toThrow(
      NotFoundError,
    );
  });
});

describe('SyncWriter events — applyCalendarList', () => {
  it("brings the source's rows up to date, keeping selection and visibility", () => {
    db.update(calendars)
      .set({ name: 'Old name', visible: false })
      .where(eq(calendars.id, calendarId))
      .run();

    const summary = writer.applyCalendarList(sourceId, [CALENDAR]);

    expect(summary).toEqual({ inserted: 0, updated: 0, removed: 0, changed: ['calendar'] });
    expect(calendarRow(CALENDAR.id)).toMatchObject({
      name: CALENDAR.name,
      color: CALENDAR.color,
      timeZone: CALENDAR.timeZone,
      isPrimary: true,
      selected: true,
      visible: false,
    });
    // unchanged: nothing to tell the renderer
    expect(writer.applyCalendarList(sourceId, [CALENDAR]).changed).toEqual([]);
  });

  it('inserts a calendar it has not seen unselected, and keeps one no longer listed', () => {
    writer.applyCalendarList(sourceId, [OTHER_CALENDAR]);

    expect(calendarRow(OTHER_CALENDAR.id)).toMatchObject({
      name: 'Team',
      color: '#42d692',
      timeZone: 'Europe/London',
      isPrimary: false,
      selected: false,
      visible: true,
    });
    expect(calendarRow(CALENDAR.id)).toBeDefined();
  });

  it("selects the primary calendar on a source's first listing only", () => {
    db.delete(calendars).where(eq(calendars.sourceId, sourceId)).run();

    writer.applyCalendarList(sourceId, [CALENDAR, OTHER_CALENDAR]);
    expect(calendarRow(CALENDAR.id)!.selected).toBe(true);
    expect(calendarRow(OTHER_CALENDAR.id)!.selected).toBe(false);

    // a primary calendar that appears later starts unselected, like any other
    const another = { ...CALENDAR, id: 'grace@example.com' };
    writer.applyCalendarList(sourceId, [CALENDAR, OTHER_CALENDAR, another]);
    expect(calendarRow(another.id)!.selected).toBe(false);
  });
});

describe('SyncWriter events — removeDeselectedCalendars', () => {
  it('removes the events of every unselected calendar still in use', async () => {
    const otherId = db
      .insert(calendars)
      .values({ sourceId, externalId: OTHER_CALENDAR.id, name: OTHER_CALENDAR.name })
      .returning()
      .get().id;
    const lunch = event({ title: 'Lunch' });
    const kickoff = event({ title: 'Kickoff' });
    const standup = event({ calendarId: OTHER_CALENDAR.id, title: 'Standup' });
    writer.applyEventPage(sourceId, calendarId, page({ events: [lunch, kickoff] }));
    writer.applyEventPage(sourceId, otherId, page({ events: [standup] }));
    await notes.createNote({ linkedEventId: eventIdOf(kickoff.externalId) });
    db.update(calendars).set({ selected: false }).where(eq(calendars.id, calendarId)).run();

    const removed = writer.removeDeselectedCalendars(sourceId);

    expect(removed).toEqual({ inserted: 0, updated: 0, removed: 2, changed: ['event'] });
    expect(linkOf(lunch.externalId)).toBeUndefined();
    expect(linkOf(kickoff.externalId)!.state).toBe(LinkState.REMOVED);
    // the selected calendar's events stay
    expect(linkOf(standup.externalId)!.state).toBe(LinkState.SYNCED);

    // done: the kept event's link is removed, so there is nothing left to remove
    expect(writer.removeDeselectedCalendars(sourceId).removed).toBe(0);
  });

  it('forgets what is parked for an unselected calendar with no events', () => {
    const series = master();
    writer.applyEventPage(
      sourceId,
      calendarId,
      page({ events: [occurrenceOf(series, OCCURRENCE_2, { cancelled: true })] }),
    );
    expect(count(externalEventExceptions)).toBe(1);
    db.update(calendars).set({ selected: false }).where(eq(calendars.id, calendarId)).run();

    writer.removeDeselectedCalendars(sourceId);
    expect(count(externalEventExceptions)).toBe(0);
  });

  it('leaves selected calendars, and unselected ones with nothing to remove, alone', () => {
    writer.applyEventPage(sourceId, calendarId, page({ events: [event()] }));
    db.insert(calendars)
      .values({ sourceId, externalId: OTHER_CALENDAR.id, name: 'Team', selected: false })
      .run();

    expect(writer.removeDeselectedCalendars(sourceId)).toEqual({
      inserted: 0,
      updated: 0,
      removed: 0,
      changed: [],
    });
    expect(count(eventsTable)).toBe(1);
  });
});
