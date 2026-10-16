import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { events as eventsTable } from '@main/db/schema/events';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { createDb } from '../utils';
import { SyncWriter } from '../../sync/writer';
import { SearchService } from '../../search/service';
import {
  AuthType,
  ExternalEvent,
  ExternalTask,
  Provider,
  SourceType,
} from '../../integrations/types';
import { TaskPriority, TaskStatus } from '../../tasks/types';
import { EventKind, EventStatus } from '../../events/types';

// The plans of the statements SyncWriter really runs to find the items waiting for a parent or a
// series master: each is captured as it executes, with its parameters, and explained. They must
// find the waiting links through idx_external_links_source_id_parent_external_id, never by
// reading every link of the source.

const AT = new Date('2026-10-01T12:00:00Z');

let db: BetterSQLite3Database;
let client: Database.Database;
let workspacePath: string;
let writer: SyncWriter;

interface Executed {
  sql: string;
  params: unknown[];
}

// every statement run while `fn` runs, with its parameters
function captured(fn: () => void): Executed[] {
  const executed: Executed[] = [];
  const proto = Object.getPrototypeOf(client.prepare('SELECT 1')) as Database.Statement;
  const spies = (['run', 'get', 'all'] as const).map((method) => {
    const original = proto[method] as (...args: unknown[]) => unknown;
    return vi.spyOn(proto, method).mockImplementation(function (
      this: Database.Statement,
      ...params: unknown[]
    ) {
      executed.push({ sql: this.source, params });
      return original.apply(this, params);
    } as never);
  });
  try {
    fn();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
  return executed;
}

function plan({ sql, params }: Executed): string {
  return (client.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[])
    .map((row) => row.detail)
    .join('\n');
}

function source(provider: Provider, sourceType: SourceType): ExternalSourceId {
  const integrationId = db
    .insert(integrations)
    .values({
      provider,
      authType: provider === Provider.LINEAR ? AuthType.API_KEY : AuthType.OAUTH,
      accountId: `${provider}-account`,
      accountLabel: 'Ada',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  return db.insert(externalSources).values({ integrationId, sourceType }).returning().get().id;
}

function issue(id: string, parentExternalId: string | null = null): ExternalTask {
  return {
    externalId: id,
    key: id.toUpperCase(),
    url: `https://linear.app/acme/issue/${id}`,
    title: `Issue ${id}`,
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: AT,
    updatedAt: AT,
    parentExternalId,
    parentKey: parentExternalId?.toUpperCase() ?? null,
    parentTitle: parentExternalId ? `Issue ${parentExternalId}` : null,
    projectExternalId: null,
    assignedToViewer: true,
  };
}

function event(id: string, overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    externalId: id,
    calendarId: 'ada@example.com',
    url: `https://www.google.com/calendar/event?eid=${id}`,
    title: `Event ${id}`,
    description: null,
    startAt: new Date('2026-10-12T15:00:00Z'),
    endAt: new Date('2026-10-12T16:00:00Z'),
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
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

// the plan must find the waiting links through the index, and nothing by scanning a table
function expectIndexed(detail: string) {
  expect(detail).toContain('idx_external_links_source_id_parent_external_id');
  expect(detail).not.toMatch(/SCAN (child|occurrence|external_links|tasks|events)\b/);
}

beforeEach(async () => {
  db = createDb();
  client = (db as typeof db & { $client: Database.Database }).$client;
  workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-sync-indexes-'));
  writer = new SyncWriter(db, new SearchService(db, workspacePath));
});

afterEach(async () => {
  await fs.rm(workspacePath, { recursive: true, force: true });
});

describe('sync indexes — adopting children', () => {
  it('adopts every waiting child of a page in one statement, through the parent index', () => {
    const sourceId = source(Provider.LINEAR, SourceType.TASKS);
    // children of two parents that are not mirrored yet, and filler so the table is not tiny
    writer.applyTaskPage(sourceId, {
      tasks: [
        issue('a1', 'a'),
        issue('a2', 'a'),
        issue('b1', 'b'),
        ...Array.from({ length: 50 }, (_, i) => issue(`x${i}`)),
      ],
      projects: [],
      removedIds: [],
    });

    const executed = captured(() =>
      writer.applyTaskPage(sourceId, {
        tasks: [issue('a'), issue('b'), issue('c')],
        projects: [],
        removedIds: [],
      }),
    );

    const adoptions = executed.filter((s) => /^update "tasks"/.test(s.sql));
    expect(adoptions).toHaveLength(1);
    expectIndexed(plan(adoptions[0]));
    // the parent's link by its external id, and the task by its primary key
    expect(plan(adoptions[0])).toContain('uq_external_links_source_external_id');
    // and it is the statement that did the work
    const parentOf = (id: string) =>
      db
        .select({ parentTaskId: tasksTable.parentTaskId })
        .from(tasksTable)
        .innerJoin(externalLinks, eq(externalLinks.taskId, tasksTable.id))
        .where(and(eq(externalLinks.sourceId, sourceId), eq(externalLinks.externalId, id)))
        .get()!.parentTaskId;
    const taskOf = (id: string) =>
      db.select().from(externalLinks).where(eq(externalLinks.externalId, id)).get()!.taskId;
    expect(parentOf('a1')).toBe(taskOf('a'));
    expect(parentOf('a2')).toBe(taskOf('a'));
    expect(parentOf('b1')).toBe(taskOf('b'));
  });
});

describe('sync indexes — series', () => {
  let sourceId: ExternalSourceId;
  let calendarId: CalendarId;

  beforeEach(() => {
    sourceId = source(Provider.GOOGLE_CALENDAR, SourceType.EVENTS);
    calendarId = db
      .insert(calendars)
      .values({ sourceId, externalId: 'ada@example.com', name: 'Ada', isPrimary: true })
      .returning()
      .get().id;
    // moved occurrences of a series whose master comes in a later page, and filler
    writer.applyEventPage(sourceId, calendarId, {
      events: [
        event('m_1', { recurringEventExternalId: 'm', originalStartAt: AT }),
        event('m_2', {
          recurringEventExternalId: 'm',
          originalStartAt: new Date(AT.getTime() + 1),
        }),
        ...Array.from({ length: 50 }, (_, i) => event(`x${i}`)),
      ],
      cancelledIds: [],
      skippedIds: [],
      fullPass: null,
    });
  });

  it('a master that arrives adopts its occurrences in one statement, through the index', () => {
    const executed = captured(() =>
      writer.applyEventPage(sourceId, calendarId, {
        events: [event('m', { recurrenceRule: 'RRULE:FREQ=WEEKLY' })],
        cancelledIds: [],
        skippedIds: [],
        fullPass: null,
      }),
    );

    const adoptions = executed.filter((s) => /^update "events"/.test(s.sql));
    expect(adoptions).toHaveLength(1);
    expectIndexed(plan(adoptions[0]));
    const seriesIds = db
      .select({ seriesId: eventsTable.seriesId })
      .from(eventsTable)
      .where(eq(eventsTable.originalStartAt, AT))
      .all();
    expect(seriesIds).toHaveLength(1);
    expect(seriesIds[0].seriesId).not.toBeNull();
  });

  it("a cancelled series finds its occurrences' links through the index", () => {
    writer.applyEventPage(sourceId, calendarId, {
      events: [event('m', { recurrenceRule: 'RRULE:FREQ=WEEKLY' })],
      cancelledIds: [],
      skippedIds: [],
      fullPass: null,
    });

    const executed = captured(() =>
      writer.applyEventPage(sourceId, calendarId, {
        events: [],
        cancelledIds: ['m'],
        skippedIds: [],
        fullPass: null,
      }),
    );

    const lookups = executed.filter(
      (s) => /^select/.test(s.sql) && s.sql.includes('"parent_external_id" in'),
    );
    expect(lookups).toHaveLength(1);
    expectIndexed(plan(lookups[0]));
    expect(db.select().from(eventsTable).all()).toHaveLength(50);
  });

  it("a full pass's sweep finds a gone series' occurrences through the index", () => {
    writer.applyEventPage(sourceId, calendarId, {
      events: [event('m', { recurrenceRule: 'RRULE:FREQ=WEEKLY' })],
      cancelledIds: [],
      skippedIds: [],
      fullPass: null,
    });

    // the last page of a pass that listed nothing: everything synced before it is gone
    const executed = captured(() =>
      writer.applyEventPage(sourceId, calendarId, {
        events: [],
        cancelledIds: [],
        skippedIds: [],
        fullPass: {
          startedAt: new Date(Date.now() + 60 * 60 * 1000),
          from: new Date('2026-01-01T00:00:00Z'),
          last: true,
        },
      }),
    );

    const lookups = executed.filter(
      (s) => /^select/.test(s.sql) && s.sql.includes('"parent_external_id" in'),
    );
    expect(lookups).toHaveLength(1);
    expectIndexed(plan(lookups[0]));
    expect(db.select().from(eventsTable).all()).toHaveLength(0);
  });
});
