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

describe('an occurrence is one the series has', () => {
  // weekly on Mondays, created on Wednesday 3 June: the first occurrence is Monday 8 June
  const WEDNESDAY = new Date('2026-06-03T09:00:00.000Z');
  const monday = (week: number) => new Date(Date.UTC(2026, 5, 8 + 7 * week, 9));

  function mondays(rule = 'RRULE:FREQ=WEEKLY;BYDAY=MO') {
    return service.createEvent({
      title: 'Planning',
      startAt: WEDNESDAY,
      endAt: new Date(WEDNESDAY.getTime() + HOUR),
      timeZone: 'UTC',
      recurrenceRule: rule,
    });
  }

  it('refuses a time the rule does not make, writing nothing', () => {
    const series = dailySeries();
    const offRule = new Date(day(2).getTime() + HOUR / 2);

    for (const scope of ['this', 'following'] as const) {
      expect(() =>
        service.updateOccurrence({ seriesId: series.id, originalStartAt: offRule }, scope, {
          title: 'X',
        }),
      ).toThrow(InvalidInputError);
      expect(() =>
        service.deleteOccurrence({ seriesId: series.id, originalStartAt: offRule }, scope),
      ).toThrow(InvalidInputError);
    }
    expect(occurrenceRows(series.id)).toEqual([]);
    expect(service.getById(series.id)).toMatchObject({ recurrenceRule: 'RRULE:FREQ=DAILY' });
    expect(service.getById(series.id).exdates).toEqual([]);
  });

  it("refuses an occurrence after an UNTIL, rather than moving the series' end", () => {
    const rule = 'RRULE:FREQ=DAILY;UNTIL=20260605T090000Z';
    const series = dailySeries(rule);

    expect(() =>
      service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(10) }, 'following'),
    ).toThrow(InvalidInputError);
    expect(() =>
      service.updateOccurrence({ seriesId: series.id, originalStartAt: day(10) }, 'following', {
        title: 'X',
      }),
    ).toThrow(InvalidInputError);
    expect(service.getById(series.id).recurrenceRule).toBe(rule);
    expect(db.select().from(events).all()).toHaveLength(1);
  });

  it("refuses a deleted COUNT series' later times, rather than extending it", () => {
    const rule = 'RRULE:FREQ=DAILY;COUNT=3';
    const series = dailySeries(rule);

    expect(() =>
      service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(5) }, 'following'),
    ).toThrow(InvalidInputError);
    expect(service.getById(series.id).recurrenceRule).toBe(rule);
  });

  it("refuses the start of a series the rule skips, as FullCalendar doesn't draw it", () => {
    const series = mondays();

    expect(() =>
      service.updateOccurrence({ seriesId: series.id, originalStartAt: WEDNESDAY }, 'this', {
        title: 'X',
      }),
    ).toThrow(InvalidInputError);
  });

  it('deletes the whole series from its first drawn occurrence when its start is skipped', () => {
    const series = mondays();

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: monday(0) }, 'following');

    expect(() => service.getById(series.id)).toThrow(NotFoundError);
  });

  it('updates the series itself from its first drawn occurrence, moving its start there', () => {
    const series = mondays('RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3');

    const updated = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: monday(0) },
      'following',
      { title: 'Planning v2' },
    );

    expect(updated).toMatchObject({
      id: series.id,
      title: 'Planning v2',
      startAt: monday(0),
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3',
    });
    expect(db.select().from(events).all()).toHaveLength(1);
  });

  it('counts a COUNT from the first drawn occurrence when the start is skipped', () => {
    const series = mondays('RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3');

    const next = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: monday(1) },
      'following',
      { title: 'Planning v2' },
    );

    expect(next.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2');
  });

  it("accepts an RDATE's occurrence, and refuses an EXDATE's", () => {
    const series = dailySeries(
      'RRULE:FREQ=DAILY;COUNT=3\nRDATE:20260620T150000Z\nEXDATE:20260602T090000Z',
    );

    const extra = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: new Date('2026-06-20T15:00:00.000Z') },
      'this',
      { title: 'Extra' },
    );
    expect(extra.title).toBe('Extra');
    expect(() =>
      service.updateOccurrence({ seriesId: series.id, originalStartAt: day(1) }, 'this', {
        title: 'X',
      }),
    ).toThrow(InvalidInputError);
  });

  it('accepts an occurrence row whose slot the rule no longer makes', () => {
    const series = dailySeries();
    const row = service.updateOccurrence({ seriesId: series.id, originalStartAt: day(3) }, 'this', {
      title: 'Moved',
    });
    service.updateEvent(series.id, { recurrenceRule: 'RRULE:FREQ=WEEKLY' });

    service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(3) }, 'this');

    expect(() => service.getById(row.id)).toThrow(NotFoundError);
  });

  it('refuses an all-day time that is not the start of its day', () => {
    const series = service.createEvent({
      title: 'Offsite',
      startAt: fromDateString('2026-06-01'),
      endAt: fromDateString('2026-06-02'),
      allDay: true,
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
    });
    const ref = (at: Date) => ({ seriesId: series.id, originalStartAt: at });

    expect(() =>
      service.updateOccurrence(
        ref(new Date(fromDateString('2026-06-08').getTime() + HOUR)),
        'this',
        { title: 'X' },
      ),
    ).toThrow(InvalidInputError);
    expect(
      service.updateOccurrence(ref(fromDateString('2026-06-08')), 'this', { title: 'Y' }).title,
    ).toBe('Y');
  });

  it('refuses a stored rule it cannot read with invalid_input', () => {
    const series = dailySeries();
    db.update(events)
      .set({ recurrenceRule: 'RRULE:FREQ=SOMETIMES' })
      .where(eq(events.id, series.id))
      .run();

    expect(() =>
      service.deleteOccurrence({ seriesId: series.id, originalStartAt: day(1) }, 'this'),
    ).toThrow(InvalidInputError);
  });
});

describe('daylight saving time', () => {
  // daily at the given New York time from the given start
  function newYork(startAt: string, minutes = 15) {
    const start = new Date(startAt);
    return service.createEvent({
      title: 'Standup',
      startAt: start,
      endAt: new Date(start.getTime() + minutes * 60 * 1000),
      timeZone: 'America/New_York',
      recurrenceRule: 'RRULE:FREQ=DAILY',
    });
  }

  it('moves later rows and cancellations by local time when a "following" edit crosses a change', () => {
    // 9:00 from Wednesday 28 October 2026; DST ends on Sunday 1 November
    const series = newYork('2026-10-28T13:00:00.000Z');
    const row = service.updateOccurrence(
      // Thursday 5 November, 9:00 EST
      { seriesId: series.id, originalStartAt: new Date('2026-11-05T14:00:00.000Z') },
      'this',
      { title: 'Has notes' },
    );
    // Friday 6 November, 9:00 EST
    service.deleteOccurrence(
      { seriesId: series.id, originalStartAt: new Date('2026-11-06T14:00:00.000Z') },
      'this',
    );

    // Friday 30 October, 9:00 EDT, moved to Monday 2 November, 9:00 EST: three days and an hour
    const next = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: new Date('2026-10-30T13:00:00.000Z') },
      'following',
      {
        startAt: new Date('2026-11-02T14:00:00.000Z'),
        endAt: new Date('2026-11-02T14:15:00.000Z'),
      },
    );

    // three days later at 9:00 EST, where the new series has its occurrences, not an hour after
    expect(service.getById(row.id)).toMatchObject({
      seriesId: next.id,
      originalStartAt: new Date('2026-11-08T14:00:00.000Z'),
    });
    expect(service.getById(next.id).exdates).toEqual([
      new Date('2026-11-08T14:00:00.000Z'),
      new Date('2026-11-09T14:00:00.000Z'),
    ]);
  });

  it('accepts an occurrence a skipped hour moves forward, as Luxon resolves it', () => {
    // 2:30 from Sunday 1 March 2026; on Sunday 8 March clocks go from 2:00 to 3:00
    const series = newYork('2026-03-01T07:30:00.000Z');

    // 2:30 does not exist on 8 March, so that occurrence is at 3:30 EDT
    const row = service.updateOccurrence(
      { seriesId: series.id, originalStartAt: new Date('2026-03-08T07:30:00.000Z') },
      'this',
      { title: 'Moved by DST' },
    );
    expect(row.title).toBe('Moved by DST');
    // and the day after, 2:30 EDT
    expect(() =>
      service.updateOccurrence(
        { seriesId: series.id, originalStartAt: new Date('2026-03-09T06:30:00.000Z') },
        'this',
        { title: 'Next day' },
      ),
    ).not.toThrow();
    // 1:30 EST on 8 March is not an occurrence
    expect(() =>
      service.updateOccurrence(
        { seriesId: series.id, originalStartAt: new Date('2026-03-08T06:30:00.000Z') },
        'this',
        { title: 'X' },
      ),
    ).toThrow(InvalidInputError);
  });

  it('ends a series split west of UTC before the occurrence, as the calendar draws it', () => {
    // 9:00 New York from Wednesday 28 October 2026
    const series = newYork('2026-10-28T13:00:00.000Z');
    const at = (iso: string) => ({ seriesId: series.id, originalStartAt: new Date(iso) });

    // from Friday 30 October, 9:00 EDT: UNTIL is 12:59:59Z that day, which is 8:59:59 in New York
    service.deleteOccurrence(at('2026-10-30T13:00:00.000Z'), 'following');
    expect(service.getById(series.id).recurrenceRule).toBe(
      'RRULE:FREQ=DAILY;UNTIL=20261030T125959Z',
    );

    // Thursday is still an occurrence; Friday is not, though 9:00 is before 12:59:59 read as UTC
    expect(
      service.updateOccurrence(at('2026-10-29T13:00:00.000Z'), 'this', { title: 'Kept' }).title,
    ).toBe('Kept');
    expect(() =>
      service.updateOccurrence(at('2026-10-30T13:00:00.000Z'), 'this', { title: 'X' }),
    ).toThrow(InvalidInputError);
  });

  it("keeps a provider's UTC UNTIL east of UTC as an instant, last occurrence included", () => {
    // 9:00 Tokyo daily, until 00:00Z on 28 October: 9:00 that day in Tokyo, the last occurrence
    const start = new Date('2026-10-26T00:00:00.000Z');
    const series = service.createEvent({
      title: 'Standup',
      startAt: start,
      endAt: new Date(start.getTime() + HOUR / 4),
      timeZone: 'Asia/Tokyo',
      recurrenceRule: 'RRULE:FREQ=DAILY;UNTIL=20261028T000000Z',
    });
    const at = (iso: string) => ({ seriesId: series.id, originalStartAt: new Date(iso) });

    expect(
      service.updateOccurrence(at('2026-10-28T00:00:00.000Z'), 'this', { title: 'Last' }).title,
    ).toBe('Last');
    expect(() =>
      service.updateOccurrence(at('2026-10-29T00:00:00.000Z'), 'this', { title: 'X' }),
    ).toThrow(InvalidInputError);
  });

  it('accepts the first of a repeated hour only', () => {
    // 1:30 from Friday 30 October 2026; on Sunday 1 November 1:00–2:00 happens twice
    const series = newYork('2026-10-30T05:30:00.000Z');
    const ref = (at: string) => ({ seriesId: series.id, originalStartAt: new Date(at) });

    // 1:30 EDT
    expect(
      service.updateOccurrence(ref('2026-11-01T05:30:00.000Z'), 'this', { title: 'First' }).title,
    ).toBe('First');
    // 1:30 EST, an hour later
    expect(() =>
      service.updateOccurrence(ref('2026-11-01T06:30:00.000Z'), 'this', { title: 'X' }),
    ).toThrow(InvalidInputError);
  });
});
