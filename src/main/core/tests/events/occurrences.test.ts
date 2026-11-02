import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { EventId } from '@common/ids';
import { EventChange, EventService } from '../../events/service';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { tasks } from '@main/db/schema/tasks';
import { InvalidInputError, NotFoundError } from '../../shared/errors';
import { fromDateString } from '../../shared/dates';
import { createDb } from '../utils';

// Editing and deleting one occurrence of a series ("this") or it and every later one ("following").

const START = new Date('2026-06-01T09:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const day = (n: number) => new Date(START.getTime() + n * DAY);

let db: BetterSQLite3Database;
let service: EventService;

beforeEach(() => {
  db = createDb();
  service = new EventService(db);
});

function dailySeries(rule = 'RRULE:FREQ=DAILY') {
  return service.createEvent({
    title: 'Standup',
    location: 'Room 1',
    startAt: START,
    endAt: new Date(START.getTime() + HOUR / 2),
    timeZone: 'UTC',
    recurrenceRule: rule,
  });
}

function occurrenceRows(seriesId: EventId) {
  return db.select().from(events).where(eq(events.seriesId, seriesId)).all();
}

function record() {
  const changes: EventChange[] = [];
  service.onChange((change) => changes.push(change));
  return changes;
}

describe('updateOccurrence — this', () => {
  it("makes the occurrence's own row from the series, and lists its start among the exdates", () => {
    const series = dailySeries();

    const row = service.updateOccurrence({ seriesId: series.id, originalStartAt: day(2) }, 'this', {
      title: 'Standup, moved',
      startAt: new Date(day(2).getTime() + HOUR),
      endAt: new Date(day(2).getTime() + 2 * HOUR),
    });

    expect(row).toMatchObject({
      title: 'Standup, moved',
      location: 'Room 1',
      calendarId: series.calendarId,
      seriesId: series.id,
      originalStartAt: day(2),
      recurrenceRule: null,
      startAt: new Date(day(2).getTime() + HOUR),
      endAt: new Date(day(2).getTime() + 2 * HOUR),
    });
    expect(service.getById(series.id).exdates).toEqual([day(2)]);
  });

  it("gives an occurrence edited without timing the series' length at its start", () => {
    const series = dailySeries();

    const row = service.updateOccurrence({ seriesId: series.id, originalStartAt: day(2) }, 'this', {
      title: 'Renamed',
    });

    expect(row).toMatchObject({ startAt: day(2), endAt: new Date(day(2).getTime() + HOUR / 2) });
  });

  it('a second edit updates that row rather than making another', () => {
    const series = dailySeries();
    const ref = { seriesId: series.id, originalStartAt: day(2) };

    const first = service.updateOccurrence(ref, 'this', { title: 'One' });
    const second = service.updateOccurrence(ref, 'this', { location: 'Room 2' });

    expect(second).toMatchObject({ id: first.id, title: 'One', location: 'Room 2' });
    expect(occurrenceRows(series.id)).toHaveLength(1);
  });

  it('keeps an all-day occurrence on whole days', () => {
    const series = service.createEvent({
      title: 'Offsite',
      startAt: fromDateString('2026-06-01'),
      endAt: fromDateString('2026-06-03'),
      allDay: true,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
    });

    const row = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: fromDateString('2026-06-08') },
      'this',
      { title: 'Offsite, renamed' },
    );

    expect(row).toMatchObject({ allDay: true, startDate: '2026-06-08', endDate: '2026-06-10' });
  });

  it('sends the new row, then the series with its new exdate', () => {
    const series = dailySeries();
    const changes = record();

    const row = service.updateOccurrence({ seriesId: series.id, originalStartAt: day(1) }, 'this', {
      title: 'X',
    });

    expect(changes).toEqual([
      { type: 'created', event: row },
      { type: 'updated', event: service.getById(series.id) },
    ]);
  });

  it("refuses a rule or calendar of the occurrence's own, a deleted occurrence and a one-off", () => {
    const series = dailySeries();
    const ref = { seriesId: series.id, originalStartAt: day(1) };
    const calendarId = db
      .insert(calendars)
      .values({ name: 'Other' })
      .returning({ id: calendars.id })
      .get().id;

    expect(() =>
      service.updateOccurrence(ref, 'this', { recurrenceRule: 'RRULE:FREQ=WEEKLY' }),
    ).toThrow(InvalidInputError);
    expect(() => service.updateOccurrence(ref, 'this', { calendarId })).toThrow(InvalidInputError);

    service.deleteOccurrence(ref, 'this');
    expect(() => service.updateOccurrence(ref, 'this', { title: 'X' })).toThrow(InvalidInputError);

    const oneOff = service.createEvent({ title: 'Once', startAt: START, endAt: day(0) });
    expect(() =>
      service.updateOccurrence({ seriesId: oneOff.id, originalStartAt: START }, 'this', {}),
    ).toThrow(InvalidInputError);
    expect(() =>
      service.updateOccurrence({ seriesId: series.id, originalStartAt: day(-1) }, 'this', {
        title: 'X',
      }),
    ).toThrow(InvalidInputError);
    expect(occurrenceRows(series.id)).toEqual([]);
  });
});

describe('deleteOccurrence — this', () => {
  it('cancels an expanded occurrence', () => {
    const series = dailySeries();
    const changes = record();

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(3) }, 'this');

    expect(service.getById(series.id).exdates).toEqual([day(3)]);
    expect(changes).toEqual([{ type: 'updated', event: service.getById(series.id) }]);
  });

  it("deletes an edited occurrence's row and keeps its start cancelled", () => {
    const series = dailySeries();
    const ref = { seriesId: series.id, originalStartAt: day(3) };
    const row = service.updateOccurrence(ref, 'this', { title: 'X' });
    const changes = record();

    service.deleteOccurrence(ref, 'this');

    expect(() => service.getById(row.id)).toThrow(NotFoundError);
    expect(service.getById(series.id).exdates).toEqual([day(3)]);
    expect(changes[0]).toEqual({ type: 'deleted', eventIds: [row.id] });
  });
});

describe('deleteOccurrence — following', () => {
  it('ends the series before the occurrence, deleting the later rows and cancellations', () => {
    const series = dailySeries('RRULE:FREQ=DAILY;COUNT=10');
    const earlier = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(1) },
      'this',
      { title: 'Kept' },
    );
    const later = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(5) },
      'this',
      { title: 'Gone' },
    );
    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(6) }, 'this');
    const changes = record();

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(4) }, 'following');

    const ended = service.getById(series.id);
    expect(ended.recurrenceRule).toBe('RRULE:FREQ=DAILY;UNTIL=20260605T085959Z');
    expect(ended.exdates).toEqual([day(1)]);
    expect(occurrenceRows(series.id).map((row) => row.id)).toEqual([earlier.id]);
    expect(() => service.getById(later.id)).toThrow(NotFoundError);
    expect(changes).toEqual([
      { type: 'deleted', eventIds: [later.id] },
      { type: 'updated', event: ended },
    ]);
  });

  it('deletes the whole series from its first occurrence', () => {
    const series = dailySeries();

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: START }, 'following');

    expect(() => service.getById(series.id)).toThrow(NotFoundError);
  });

  it('ends an all-day series on the day before', () => {
    const series = service.createEvent({
      title: 'Holiday',
      startAt: fromDateString('2026-06-01'),
      endAt: fromDateString('2026-06-02'),
      allDay: true,
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
    });

    service.deleteOccurrence(
      { seriesId: series.id, originalStartAt: fromDateString('2026-06-15') },
      'following',
    );

    expect(service.getById(series.id).recurrenceRule).toBe('RRULE:FREQ=WEEKLY;UNTIL=20260614');
  });

  it('refuses a rule it cannot split, writing nothing', () => {
    const rule = 'RRULE:FREQ=DAILY\nRDATE:20260620T090000Z';
    const series = dailySeries(rule);

    expect(() =>
      service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(3) }, 'following'),
    ).toThrow(InvalidInputError);
    expect(service.getById(series.id).recurrenceRule).toBe(rule);
  });
});

describe('updateOccurrence — following', () => {
  it('splits the series, moving later rows and cancellations to the new one', () => {
    const series = dailySeries('RRULE:FREQ=DAILY;COUNT=10\nEXDATE:20260620T090000Z');
    const earlier = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(1) },
      'this',
      { title: 'Earlier' },
    );
    const later = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(6) },
      'this',
      { title: 'Later' },
    );
    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(7) }, 'this');

    // from the fifth occurrence on, an hour later and renamed
    const next = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(4) },
      'following',
      {
        title: 'Standup v2',
        startAt: new Date(day(4).getTime() + HOUR),
        endAt: new Date(day(4).getTime() + HOUR + HOUR / 2),
      },
    );

    expect(next).toMatchObject({
      title: 'Standup v2',
      location: 'Room 1',
      seriesId: null,
      startAt: new Date(day(4).getTime() + HOUR),
      endAt: new Date(day(4).getTime() + HOUR + HOUR / 2),
      // ten in all, four of them before the split
      recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=6\nEXDATE:20260620T090000Z',
      exdates: [new Date(day(6).getTime() + HOUR), new Date(day(7).getTime() + HOUR)],
    });
    expect(service.getById(later.id)).toMatchObject({
      seriesId: next.id,
      originalStartAt: new Date(day(6).getTime() + HOUR),
      title: 'Later',
    });

    const old = service.getById(series.id);
    expect(old.recurrenceRule).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20260605T085959Z\nEXDATE:20260620T090000Z',
    );
    expect(old.exdates).toEqual([day(1)]);
    expect(service.getById(earlier.id).seriesId).toBe(series.id);
    expect(db.select().from(eventExceptions).all()).toHaveLength(1);
  });

  it('updates the series itself from its first occurrence', () => {
    const series = dailySeries();
    const row = service.updateOccurrence({ seriesId: series.id, originalStartAt: day(2) }, 'this', {
      title: 'Moved',
    });

    const updated = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: START },
      'following',
      {
        startAt: new Date(START.getTime() + 2 * HOUR),
        endAt: new Date(START.getTime() + 2 * HOUR + HOUR / 2),
      },
    );

    expect(updated).toMatchObject({
      id: series.id,
      recurrenceRule: 'RRULE:FREQ=DAILY',
      startAt: new Date(START.getTime() + 2 * HOUR),
      exdates: [new Date(day(2).getTime() + 2 * HOUR)],
    });
    expect(service.getById(row.id).originalStartAt).toEqual(new Date(day(2).getTime() + 2 * HOUR));
  });

  it('a null rule makes the occurrence a one-off and deletes the later rows', () => {
    const series = dailySeries();
    const later = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(6) },
      'this',
      { title: 'Later' },
    );
    const changes = record();

    const oneOff = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: day(4) },
      'following',
      { recurrenceRule: null },
    );

    expect(oneOff).toMatchObject({ recurrenceRule: null, startAt: day(4), exdates: [] });
    expect(() => service.getById(later.id)).toThrow(NotFoundError);
    expect(changes.map((change) => change.type)).toEqual(['updated', 'created', 'deleted']);
  });

  it("counts a COUNT rule's earlier occurrences in the series' zone, across a DST change", () => {
    // 9:00 in New York every day from Friday 30 October 2026; DST ends on Sunday 1 November
    const series = service.createEvent({
      title: 'Standup',
      startAt: new Date('2026-10-30T13:00:00.000Z'),
      endAt: new Date('2026-10-30T13:30:00.000Z'),
      timeZone: 'America/New_York',
      recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=10',
    });

    // Monday 2 November, still 9:00 in New York
    const next = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: new Date('2026-11-02T14:00:00.000Z') },
      'following',
      { title: 'Standup v2' },
    );

    expect(next.recurrenceRule).toBe('RRULE:FREQ=DAILY;COUNT=7');
  });

  it('refuses an occurrence after a COUNT series has ended, writing nothing', () => {
    const series = dailySeries('RRULE:FREQ=DAILY;COUNT=3');

    expect(() =>
      service.updateOccurrence({ seriesId: series.id, originalStartAt: day(5) }, 'following', {
        title: 'X',
      }),
    ).toThrow(InvalidInputError);
    expect(service.getById(series.id).recurrenceRule).toBe('RRULE:FREQ=DAILY;COUNT=3');
  });
});

describe('removing a series keeps the occurrences notes and tasks link to', () => {
  function linkedOccurrences(seriesId: EventId) {
    const forNote = service.updateOccurrence({ seriesId, originalStartAt: day(5) }, 'this', {
      title: 'Has a note',
    });
    const forTask = service.updateOccurrence({ seriesId, originalStartAt: day(6) }, 'this', {
      title: 'Has a task',
    });
    const unlinked = service.updateOccurrence({ seriesId, originalStartAt: day(7) }, 'this', {
      title: 'Unlinked',
    });
    db.insert(notes).values({ title: 'Notes', filePath: 'n.md', linkedEventId: forNote.id }).run();
    db.insert(tasks).values({ title: 'Follow up', linkedEventId: forTask.id }).run();
    return { forNote, forTask, unlinked };
  }

  it('deleteEvent keeps them as one-offs and deletes the rest', () => {
    const series = dailySeries();
    const { forNote, forTask, unlinked } = linkedOccurrences(series.id);
    const changes = record();

    service.deleteEvent(series.id);

    expect(() => service.getById(unlinked.id)).toThrow(NotFoundError);
    for (const kept of [forNote, forTask]) {
      expect(service.getById(kept.id)).toMatchObject({ seriesId: null, originalStartAt: null });
    }
    expect(changes).toEqual([
      { type: 'deleted', eventIds: [series.id, unlinked.id] },
      { type: 'updated', event: service.getById(forNote.id) },
      { type: 'updated', event: service.getById(forTask.id) },
    ]);
  });

  it('so do deleting the following occurrences and making them a one-off', () => {
    const series = dailySeries();
    const { forNote, unlinked } = linkedOccurrences(series.id);

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(4) }, 'following');

    expect(() => service.getById(unlinked.id)).toThrow(NotFoundError);
    expect(service.getById(forNote.id).seriesId).toBeNull();

    const other = dailySeries();
    const linked = linkedOccurrences(other.id);
    service.updateOccurrence({ seriesId: other.id, originalStartAt: day(4) }, 'following', {
      recurrenceRule: null,
    });
    expect(() => service.getById(linked.unlinked.id)).toThrow(NotFoundError);
    expect(service.getById(linked.forTask.id).seriesId).toBeNull();
  });

  it('deleting the one occurrence deletes it, linked or not', () => {
    const series = dailySeries();
    const { forNote } = linkedOccurrences(series.id);

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(5) }, 'this');

    expect(() => service.getById(forNote.id)).toThrow(NotFoundError);
  });
});
