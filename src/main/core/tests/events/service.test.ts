import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { generateId } from '@common/ids';
import { EventChange, EventService } from '../../events/service';
import { events } from '@main/db/schema/events';
import { NotFoundError } from '../../shared/errors';
import { createDb } from '../utils';

// a fixed "day view" window, used across the listForCalendar range tests so
// overlap behavior at the edges is deterministic rather than tied to
// whatever Date.now() happens to be when the suite runs
const RANGE_START = new Date('2026-06-10T00:00:00.000Z');
const RANGE_END = new Date('2026-06-10T23:59:59.999Z');

function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

let db: BetterSQLite3Database;
let eventsService: EventService;

beforeEach(() => {
  db = createDb();
  eventsService = new EventService(db);
});

describe('EventService — createEvent', () => {
  it('creates an event and returns it with an assigned id', async () => {
    const startAt = new Date('2026-06-10T10:00:00.000Z');
    const endAt = new Date('2026-06-10T11:00:00.000Z');
    const event = eventsService.createEvent({ title: 'Standup', startAt, endAt });
    expect(event.id).toBeTruthy();
    expect(event.title).toBe('Standup');
    expect(event.startAt.getTime()).toBe(startAt.getTime());
    expect(event.endAt.getTime()).toBe(endAt.getTime());
  });

  it('defaults optional fields to null when not provided', async () => {
    const event = eventsService.createEvent({
      title: 'Minimal',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    expect(event.description).toBeNull();
    expect(event.allDay).toBe(false);
    expect(event.location).toBeNull();
    expect(event.recurrenceRule).toBeNull();
    expect(event.meetingUrl).toBeNull();
    expect(event.color).toBeNull();
  });

  it('stores the provided optional fields', async () => {
    const event = eventsService.createEvent({
      title: 'Full',
      description: 'Details',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
      allDay: false,
      location: 'Room 1',
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      meetingUrl: 'https://example.com/meet',
      color: '#00ff00',
    });
    expect(event.description).toBe('Details');
    expect(event.allDay).toBe(false);
    expect(event.location).toBe('Room 1');
    expect(event.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(event.meetingUrl).toBe('https://example.com/meet');
    expect(event.color).toBe('#00ff00');
  });

  it('throws when endAt is before startAt', async () => {
    expect(() =>
      eventsService.createEvent({
        title: 'Backwards',
        startAt: new Date('2026-06-10T11:00:00.000Z'),
        endAt: new Date('2026-06-10T10:00:00.000Z'),
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringMatching(/endAt must not be before startAt/i),
      }),
    );
  });
});

describe('EventService — getById', () => {
  it('returns the event for a valid id', async () => {
    const created = eventsService.createEvent({
      title: 'Find me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const found = eventsService.getById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.title).toBe('Find me');
  });

  it('throws NotFoundError for an unknown id', async () => {
    expect(() => eventsService.getById(generateId('event'))).toThrow(NotFoundError);
  });
});

describe('EventService — getByIds', () => {
  it('returns all events matching the provided ids', async () => {
    const a = eventsService.createEvent({
      title: 'A',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const b = eventsService.createEvent({
      title: 'B',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    eventsService.createEvent({
      title: 'C',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    }); // not requested

    const result = eventsService.getByIds([a.id, b.id]);
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('returns an empty array when none of the ids match', async () => {
    const result = eventsService.getByIds([generateId('event'), generateId('event')]);
    expect(result).toHaveLength(0);
  });
});

describe('EventService — updateEvent', () => {
  it('updates the title', async () => {
    const event = eventsService.createEvent({
      title: 'Old title',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const updated = eventsService.updateEvent(event.id, { title: 'New title' });
    expect(updated.title).toBe('New title');
  });

  it('persists fields that were not passed', async () => {
    const event = eventsService.createEvent({
      title: 'Original',
      description: 'Keep me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const updated = eventsService.updateEvent(event.id, { title: 'Changed' });
    expect(updated.description).toBe('Keep me');
  });

  it('updates startAt and endAt together', async () => {
    const event = eventsService.createEvent({
      title: 'Move me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const newStart = new Date('2026-06-11T14:00:00.000Z');
    const newEnd = new Date('2026-06-11T15:00:00.000Z');
    const updated = eventsService.updateEvent(event.id, {
      startAt: newStart,
      endAt: newEnd,
    });
    expect(updated.startAt.getTime()).toBe(newStart.getTime());
    expect(updated.endAt.getTime()).toBe(newEnd.getTime());
  });

  it('throws when moving endAt alone before the existing startAt', async () => {
    const event = eventsService.createEvent({
      title: 'Event',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    expect(() =>
      eventsService.updateEvent(event.id, { endAt: new Date('2026-06-10T09:00:00.000Z') }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringMatching(/endAt must not be before startAt/i),
      }),
    );
  });

  it('throws when moving startAt alone past the existing endAt', async () => {
    const event = eventsService.createEvent({
      title: 'Event',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    expect(() =>
      eventsService.updateEvent(event.id, { startAt: new Date('2026-06-10T12:00:00.000Z') }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_input',
        message: expect.stringMatching(/endAt must not be before startAt/i),
      }),
    );
  });

  it('clears recurrenceRule when explicitly set to null', async () => {
    const event = eventsService.createEvent({
      title: 'Recurring',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const updated = eventsService.updateEvent(event.id, { recurrenceRule: null });
    expect(updated.recurrenceRule).toBeNull();
  });

  it('throws NotFoundError for an unknown id', async () => {
    expect(() => eventsService.updateEvent(generateId('event'), { title: 'Ghost' })).toThrow(
      NotFoundError,
    );
  });
});

describe('EventService — deleteEvent', () => {
  it('deletes an existing event', async () => {
    const event = eventsService.createEvent({
      title: 'Delete me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    eventsService.deleteEvent(event.id);
    expect(() => eventsService.getById(event.id)).toThrow(NotFoundError);
  });

  it('throws NotFoundError for an unknown id', async () => {
    expect(() => eventsService.deleteEvent(generateId('event'))).toThrow(NotFoundError);
  });
});

describe('EventService — onChange', () => {
  const startAt = new Date('2026-06-10T10:00:00.000Z');
  const endAt = new Date('2026-06-10T11:00:00.000Z');

  function record() {
    const changes: EventChange[] = [];
    eventsService.onChange((change) => changes.push(change));
    return changes;
  }

  it('sends each create, update and delete with what it wrote', async () => {
    const changes = record();

    const event = eventsService.createEvent({ title: 'Standup', startAt, endAt });
    const updated = eventsService.updateEvent(event.id, { title: 'Retro' });
    eventsService.deleteEvent(event.id);

    expect(changes).toEqual([
      { type: 'created', event },
      { type: 'updated', event: updated },
      { type: 'deleted', eventIds: [event.id] },
    ]);
    expect(updated.title).toBe('Retro');
  });

  it("deleting a series sends its occurrence rows' ids with it", async () => {
    const series = eventsService.createEvent({
      title: 'Weekly',
      startAt,
      endAt,
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
    });
    const [occurrence] = db
      .insert(events)
      .values({
        title: 'Weekly, moved',
        startAt: hoursAfter(startAt, 24 * 7 + 1),
        endAt: hoursAfter(endAt, 24 * 7 + 1),
        seriesId: series.id,
        originalStartAt: hoursAfter(startAt, 24 * 7),
      })
      .returning()
      .all();
    const changes = record();

    eventsService.deleteEvent(series.id);

    expect(changes).toEqual([{ type: 'deleted', eventIds: [series.id, occurrence.id] }]);
  });

  it('sends nothing when the write is refused', async () => {
    const changes = record();

    expect(() => eventsService.deleteEvent(generateId('event'))).toThrow(NotFoundError);
    expect(() => eventsService.updateEvent(generateId('event'), { title: 'Nope' })).toThrow(
      NotFoundError,
    );
    expect(() =>
      eventsService.createEvent({ title: 'Backwards', startAt: endAt, endAt: startAt }),
    ).toThrow();

    expect(changes).toEqual([]);
  });

  it('a listener that throws fails neither the write nor the other listeners', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    eventsService.onChange(() => {
      throw new Error('listener failed');
    });
    const changes = record();

    try {
      const event = eventsService.createEvent({ title: 'Standup', startAt, endAt });
      expect(eventsService.getById(event.id)).toMatchObject({ title: 'Standup' });
    } finally {
      error.mockRestore();
    }
    expect(changes).toHaveLength(1);
  });

  it('stops sending to a listener once it unsubscribes', async () => {
    const listener = vi.fn();
    const unsubscribe = eventsService.onChange(listener);

    const event = eventsService.createEvent({ title: 'Standup', startAt, endAt });
    unsubscribe();
    eventsService.deleteEvent(event.id);

    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('EventService — listForCalendar range', () => {
  it('includes a non-recurring event fully inside the range', async () => {
    const event = eventsService.createEvent({
      title: 'Inside',
      startAt: hoursAfter(RANGE_START, 2),
      endAt: hoursAfter(RANGE_START, 3),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that starts before the range and ends inside it', async () => {
    const event = eventsService.createEvent({
      title: 'Straddles start',
      startAt: hoursAfter(RANGE_START, -6), // day before, 6pm
      endAt: hoursAfter(RANGE_START, 2),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that starts inside the range and ends after it', async () => {
    const event = eventsService.createEvent({
      title: 'Straddles end',
      startAt: hoursAfter(RANGE_START, 20),
      endAt: hoursAfter(RANGE_START, 30), // spills into the next day
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that spans the entire range', async () => {
    const event = eventsService.createEvent({
      title: 'Multi-day conference',
      startAt: hoursAfter(RANGE_START, -24),
      endAt: hoursAfter(RANGE_START, 48),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('excludes a non-recurring event entirely before the range', async () => {
    const event = eventsService.createEvent({
      title: 'Yesterday',
      startAt: hoursAfter(RANGE_START, -5),
      endAt: hoursAfter(RANGE_START, -2),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('excludes a non-recurring event entirely after the range', async () => {
    const event = eventsService.createEvent({
      title: 'Tomorrow',
      startAt: hoursAfter(RANGE_END, 2),
      endAt: hoursAfter(RANGE_END, 3),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('includes a recurring event whose anchor start falls before the range end', async () => {
    // e.g. a weekly standup that started long before this particular week
    const event = eventsService.createEvent({
      title: 'Weekly standup',
      startAt: new Date('2025-01-06T10:00:00.000Z'),
      endAt: new Date('2025-01-06T10:30:00.000Z'),
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('excludes a recurring event whose anchor start is after the range end', async () => {
    const event = eventsService.createEvent({
      title: 'Future series',
      startAt: hoursAfter(RANGE_END, 24),
      endAt: hoursAfter(RANGE_END, 24.5),
      recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('orders results by startAt ascending', async () => {
    const later = eventsService.createEvent({
      title: 'Later',
      startAt: hoursAfter(RANGE_START, 10),
      endAt: hoursAfter(RANGE_START, 11),
    });
    const earlier = eventsService.createEvent({
      title: 'Earlier',
      startAt: hoursAfter(RANGE_START, 2),
      endAt: hoursAfter(RANGE_START, 3),
    });
    const result = eventsService.listForCalendar(RANGE_START, RANGE_END);
    expect(result[0].id).toBe(earlier.id);
    expect(result[1].id).toBe(later.id);
  });
});
