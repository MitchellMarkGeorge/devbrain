import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { CalendarId, EventId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events } from '@main/db/schema/events';
import { externalSources, integrations } from '@main/db/schema/integrations';
import { EventService } from '../../events/service';
import { CalendarService } from '../../calendars/service';
import { DEFAULT_CALENDAR_ID } from '../../calendars/types';
import { EventKind, EventStatus } from '../../events/types';
import {
  allDayDates,
  fromDateString,
  isDateString,
  localTimeZone,
  toDateString,
} from '../../shared/dates';
import { AuthType, Provider, SourceType } from '../../integrations/types';
import { NotFoundError } from '../../shared/errors';
import { createDb } from '../utils';

// The parts of the event model the calendar view (FullCalendar) relies on: calendars, all-day
// dates, time zones, series with their exdates, and the unpaginated range read.

const MONDAY = new Date('2026-10-05T14:00:00.000Z');
const WEEKLY = 'RRULE:FREQ=WEEKLY;BYDAY=MO';

let db: BetterSQLite3Database;
let eventsService: EventService;
let calendarService: CalendarService;

beforeEach(() => {
  db = createDb();
  eventsService = new EventService(db);
  calendarService = new CalendarService(db);
});

function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// a calendar synced from a provider, as SyncWriter.applyCalendarList stores one
function syncedCalendar(overrides: Partial<typeof calendars.$inferInsert> = {}): CalendarId {
  const integrationId = db
    .insert(integrations)
    .values({
      provider: Provider.GOOGLE_CALENDAR,
      authType: AuthType.OAUTH,
      accountId: `subject-${Math.random()}`,
      accountLabel: 'ada@example.com',
      credentials: Buffer.from('x'),
    })
    .returning()
    .get().id;
  const sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.EVENTS })
    .returning()
    .get().id;
  return db
    .insert(calendars)
    .values({ sourceId, externalId: 'ada@example.com', name: 'Ada', ...overrides })
    .returning()
    .get().id;
}

describe('dates — all-day helpers', () => {
  it('reads and writes dates in the local zone', () => {
    expect(toDateString(new Date(2026, 9, 14, 23, 30))).toBe('2026-10-14');
    expect(fromDateString('2026-10-14')).toEqual(new Date(2026, 9, 14));
    expect(() => fromDateString('14/10/2026')).toThrow('Not a date');
  });

  it('accepts only real dates', () => {
    expect(isDateString('2028-02-29')).toBe(true);
    // a month or day out of range would otherwise roll over into another date
    for (const value of ['2026-13-01', '2026-02-30', '2027-02-29', '2026-1-1']) {
      expect(isDateString(value)).toBe(false);
      expect(() => fromDateString(value)).toThrow('Not a date');
    }
  });

  it('turns instants into dates: the start day, and the day after the last day touched', () => {
    // as the seed script writes one: midnight to 23:59 the same day
    expect(allDayDates(new Date(2026, 9, 14), new Date(2026, 9, 14, 23, 59))).toEqual({
      startDate: '2026-10-14',
      endDate: '2026-10-15',
    });
    // an end at midnight touches only the day before
    expect(allDayDates(new Date(2026, 9, 14), new Date(2026, 9, 16))).toEqual({
      startDate: '2026-10-14',
      endDate: '2026-10-16',
    });
    // a zero-length one still lasts its day
    expect(allDayDates(new Date(2026, 9, 14), new Date(2026, 9, 14))).toEqual({
      startDate: '2026-10-14',
      endDate: '2026-10-15',
    });
  });
});

describe('EventService — calendars and time zones', () => {
  it('puts a new event in the default calendar, in the app zone, confirmed and ordinary', async () => {
    const event = eventsService.createEvent({
      title: 'Standup',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 1),
    });
    expect(event).toMatchObject({
      calendarId: DEFAULT_CALENDAR_ID,
      timeZone: localTimeZone(),
      status: EventStatus.CONFIRMED,
      kind: EventKind.DEFAULT,
      response: null,
      seriesId: null,
      originalStartAt: null,
      exdates: [],
      external: null,
    });
  });

  it('keeps the given zone, status and kind', async () => {
    const event = eventsService.createEvent({
      title: 'Deep work',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 2),
      timeZone: 'Europe/London',
      status: EventStatus.TENTATIVE,
      kind: EventKind.FOCUS_TIME,
    });
    expect(event).toMatchObject({
      timeZone: 'Europe/London',
      status: EventStatus.TENTATIVE,
      kind: EventKind.FOCUS_TIME,
    });
  });

  it('refuses a calendar that does not exist, or one synced from a provider', async () => {
    const synced = syncedCalendar();
    const options = { title: 'x', startAt: MONDAY, endAt: hoursAfter(MONDAY, 1) };
    expect(() =>
      eventsService.createEvent({ ...options, calendarId: 'cal_missing' as CalendarId }),
    ).toThrow(NotFoundError);
    expect(() => eventsService.createEvent({ ...options, calendarId: synced })).toThrow(
      expect.objectContaining({
        code: 'external_read_only',
        message: expect.stringContaining('read-only'),
      }),
    );
  });

  it('checks the calendar and inserts with no queued work able to run in between', async () => {
    // work queued before the call (say, a sync page whose pull just finished) that makes the
    // default calendar synced
    const { sourceId } = db
      .select({ sourceId: calendars.sourceId })
      .from(calendars)
      .where(eq(calendars.id, syncedCalendar()))
      .get()!;
    queueMicrotask(() => {
      db.update(calendars).set({ sourceId }).where(eq(calendars.id, DEFAULT_CALENDAR_ID)).run();
    });
    const options = { title: 'x', startAt: MONDAY, endAt: hoursAfter(MONDAY, 1) };

    // the check and the insert run in one go, before the queued work
    const event = eventsService.createEvent(options);
    expect(event.calendarId).toBe(DEFAULT_CALENDAR_ID);

    // once it has run, the calendar is read-only
    await Promise.resolve();
    expect(() => eventsService.createEvent(options)).toThrow(
      expect.objectContaining({ code: 'external_read_only' }),
    );
  });
});

describe('EventService — all-day events', () => {
  it('derives the dates from the instants, and moves the instants to their local midnights', async () => {
    const event = eventsService.createEvent({
      title: 'Offsite',
      startAt: new Date(2026, 9, 14, 9),
      endAt: new Date(2026, 9, 15, 17),
      allDay: true,
    });
    expect(event).toMatchObject({
      allDay: true,
      startDate: '2026-10-14',
      endDate: '2026-10-16',
      startAt: new Date(2026, 9, 14),
      endAt: new Date(2026, 9, 16),
    });
  });

  it('takes given dates over the instants', async () => {
    const event = eventsService.createEvent({
      title: 'Holiday',
      startAt: MONDAY,
      endAt: MONDAY,
      allDay: true,
      startDate: '2026-12-24',
      endDate: '2026-12-27',
    });
    expect(event).toMatchObject({
      startDate: '2026-12-24',
      endDate: '2026-12-27',
      startAt: new Date(2026, 11, 24),
    });
  });

  it('refuses dates that are malformed, or an end not after the start', async () => {
    const base = { title: 'x', startAt: MONDAY, endAt: MONDAY, allDay: true };
    expect(() =>
      eventsService.createEvent({ ...base, startDate: '24/12/2026', endDate: '2026-12-27' }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringContaining('Not a date'),
      }),
    );
    expect(() =>
      eventsService.createEvent({ ...base, startDate: '2026-12-24', endDate: '2026-02-30' }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringContaining('Not a date'),
      }),
    );
    expect(() =>
      eventsService.createEvent({ ...base, startDate: '2026-12-24', endDate: '2026-12-24' }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringContaining('endDate must be after startDate'),
      }),
    );
  });

  it('gives a timed event no dates', async () => {
    const event = eventsService.createEvent({
      title: 'Call',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 1),
    });
    expect(event).toMatchObject({ allDay: false, startDate: null, endDate: null });
  });

  it('keeps the dates in step when an event turns all-day, moves, or turns timed again', async () => {
    const event = eventsService.createEvent({
      title: 'Planning',
      startAt: new Date(2026, 9, 14, 10),
      endAt: new Date(2026, 9, 14, 11),
    });

    const allDay = eventsService.updateEvent(event.id, { allDay: true });
    expect(allDay).toMatchObject({ startDate: '2026-10-14', endDate: '2026-10-15' });

    const moved = eventsService.updateEvent(event.id, {
      startDate: '2026-10-20',
      endDate: '2026-10-22',
    });
    expect(moved).toMatchObject({ startDate: '2026-10-20', startAt: new Date(2026, 9, 20) });

    // a title change leaves the timing alone
    const renamed = eventsService.updateEvent(event.id, { title: 'Planning (moved)' });
    expect(renamed).toMatchObject({ startDate: '2026-10-20', endDate: '2026-10-22' });

    const timed = eventsService.updateEvent(event.id, {
      allDay: false,
      startAt: new Date(2026, 9, 20, 9),
      endAt: new Date(2026, 9, 20, 10),
    });
    expect(timed).toMatchObject({ allDay: false, startDate: null, endDate: null });
  });
});

describe('EventService — series and exdates', () => {
  async function series() {
    return eventsService.createEvent({
      title: 'Weekly sync',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 0.5),
      recurrenceRule: WEEKLY,
    });
  }

  // an occurrence row of a series, as the sync writer stores a moved one
  function occurrence(seriesId: EventId, originalStartAt: Date, startAt: Date): EventId {
    return db
      .insert(events)
      .values({
        title: 'Moved',
        startAt,
        endAt: hoursAfter(startAt, 0.5),
        seriesId,
        originalStartAt,
      })
      .returning()
      .get().id;
  }

  it('reads a series with what it no longer has: cancelled occurrences and moved ones, in time order', async () => {
    const weekly = await series();
    const week3 = new Date('2026-10-19T14:00:00.000Z');
    const week2 = new Date('2026-10-12T14:00:00.000Z');
    db.insert(eventExceptions).values({ seriesId: weekly.id, originalStartAt: week3 }).run();
    occurrence(weekly.id, week2, new Date('2026-10-13T14:00:00.000Z'));

    expect(eventsService.getById(weekly.id).exdates).toEqual([week2, week3]);
    const [listed] = eventsService.getByIds([weekly.id]).map((event) => event.exdates);
    expect(listed).toEqual([week2, week3]);
  });

  it('gives an event that is not a series no exdates', async () => {
    const event = eventsService.createEvent({
      title: 'Call',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 1),
    });
    expect(eventsService.getById(event.id).exdates).toEqual([]);
  });

  it('deletes a series with its occurrence rows and its cancelled occurrences', async () => {
    const weekly = await series();
    const moved = occurrence(
      weekly.id,
      new Date('2026-10-12T14:00:00.000Z'),
      new Date('2026-10-13T14:00:00.000Z'),
    );
    db.insert(eventExceptions)
      .values({ seriesId: weekly.id, originalStartAt: new Date('2026-10-19T14:00:00.000Z') })
      .run();

    eventsService.deleteEvent(weekly.id);

    expect(() => eventsService.getById(moved)).toThrow(NotFoundError);
    expect(db.select().from(eventExceptions).all()).toEqual([]);
  });
});

describe('EventService — listForCalendar', () => {
  const RANGE_START = new Date('2026-10-05T00:00:00.000Z');
  const RANGE_END = new Date('2026-10-11T23:59:59.999Z');

  it('returns every event in the range, unpaginated and in time order', async () => {
    for (let i = 0; i < 60; i++) {
      eventsService.createEvent({
        title: `Event ${i}`,
        startAt: hoursAfter(RANGE_START, i * 2),
        endAt: hoursAfter(RANGE_START, i * 2 + 1),
      });
    }
    const listed = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(listed).toHaveLength(60);
    expect(listed[0].title).toBe('Event 0');
    expect(listed.at(-1)!.title).toBe('Event 59');
  });

  it('leaves out hidden calendars, and can be narrowed to some calendars', async () => {
    const synced = syncedCalendar();
    eventsService.createEvent({
      title: 'Local',
      startAt: MONDAY,
      endAt: hoursAfter(MONDAY, 1),
    });
    db.insert(events)
      .values({
        calendarId: synced,
        title: 'Synced',
        startAt: MONDAY,
        endAt: hoursAfter(MONDAY, 1),
      })
      .run();

    const titles = async (options = {}) =>
      eventsService.listForCalendar(RANGE_START, RANGE_END, options).map((e) => e.title);
    expect(await titles()).toEqual(['Local', 'Synced']);
    expect(await titles({ calendarIds: [synced] })).toEqual(['Synced']);

    calendarService.setVisible(synced, false);
    expect(await titles()).toEqual(['Local']);
  });

  it('includes a series that started before the range, with its exdates', async () => {
    const weekly = eventsService.createEvent({
      title: 'Weekly sync',
      startAt: new Date('2026-09-07T14:00:00.000Z'),
      endAt: new Date('2026-09-07T14:30:00.000Z'),
      recurrenceRule: WEEKLY,
    });
    db.insert(eventExceptions).values({ seriesId: weekly.id, originalStartAt: MONDAY }).run();

    const [listed] = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(listed).toMatchObject({ id: weekly.id, exdates: [MONDAY] });
  });
});

describe('CalendarService', () => {
  it('lists the default calendar, local calendars first', async () => {
    const synced = syncedCalendar({ name: 'Ada', isPrimary: true });
    expect(calendarService.list().map((calendar) => calendar.id)).toEqual([
      DEFAULT_CALENDAR_ID,
      synced,
    ]);
    expect(calendarService.getById(DEFAULT_CALENDAR_ID)).toMatchObject({
      name: 'DevBrain',
      sourceId: null,
      selected: true,
      visible: true,
    });
  });

  it('shows and hides a calendar, and refuses one that does not exist', async () => {
    expect(calendarService.setVisible(DEFAULT_CALENDAR_ID, false).visible).toBe(false);
    expect(calendarService.getById(DEFAULT_CALENDAR_ID).visible).toBe(false);
    expect(() => calendarService.setVisible('cal_missing' as CalendarId, true)).toThrow(
      NotFoundError,
    );
  });

  it('chooses whether a synced calendar syncs, touching only the column', async () => {
    const synced = syncedCalendar({ selected: true });
    const event = db
      .insert(events)
      .values({ calendarId: synced, title: 'Standup', startAt: MONDAY, endAt: MONDAY })
      .returning()
      .get();

    expect(calendarService.setSelected(synced, false)).toMatchObject({
      id: synced,
      selected: false,
      visible: true,
    });
    // its events go at the source's next sync run, not here
    expect(eventsService.getById(event.id)).toMatchObject({ title: 'Standup' });
    expect(calendarService.setSelected(synced, true).selected).toBe(true);
  });

  it('refuses to choose for a local calendar, which always syncs, or one that does not exist', async () => {
    expect(() => calendarService.setSelected(DEFAULT_CALENDAR_ID, false)).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringContaining('always syncs'),
      }),
    );
    expect(calendarService.getById(DEFAULT_CALENDAR_ID).selected).toBe(true);
    expect(() => calendarService.setSelected('cal_missing' as CalendarId, true)).toThrow(
      NotFoundError,
    );
  });

  it('tells its listeners about each calendar it changed, and nothing about a refusal', () => {
    const synced = syncedCalendar({ selected: true });
    const changes: unknown[] = [];
    calendarService.onChange((change) => changes.push(change));

    calendarService.setVisible(DEFAULT_CALENDAR_ID, false);
    calendarService.setSelected(synced, false);
    expect(() => calendarService.setSelected(DEFAULT_CALENDAR_ID, false)).toThrow();

    expect(changes).toEqual([
      {
        type: 'visibility_changed',
        calendar: expect.objectContaining({ id: DEFAULT_CALENDAR_ID, visible: false }),
      },
      {
        type: 'selection_changed',
        calendar: expect.objectContaining({ id: synced, selected: false }),
      },
    ]);
  });

  it('changes and announces nothing when a calendar already has the value', () => {
    const synced = syncedCalendar({ selected: true });
    const before = calendarService.getById(synced);
    const changes: unknown[] = [];
    calendarService.onChange((change) => changes.push(change));

    expect(calendarService.setSelected(synced, true)).toEqual(before);
    expect(calendarService.setVisible(synced, true)).toEqual(before);

    expect(changes).toEqual([]);
    expect(calendarService.getById(synced).updatedAt).toEqual(before.updatedAt);
  });
});
