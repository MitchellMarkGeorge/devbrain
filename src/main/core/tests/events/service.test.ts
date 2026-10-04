import { describe, it, expect, beforeEach } from 'vitest';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { generateId } from '@common/ids';
import { EventService } from '../../events/service';
import { NotFoundError } from '../../shared/errors';
import { createDb } from '../utils';
import { InvalidCursorError } from '../../shared/pagination';

// a fixed "day view" window, used across the listEventsInRange tests so
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
    const event = await eventsService.createEvent({ title: 'Standup', startAt, endAt });
    expect(event.id).toBeTruthy();
    expect(event.title).toBe('Standup');
    expect(event.startAt.getTime()).toBe(startAt.getTime());
    expect(event.endAt.getTime()).toBe(endAt.getTime());
  });

  it('defaults optional fields to null when not provided', async () => {
    const event = await eventsService.createEvent({
      title: 'Minimal',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    expect(event.description).toBeNull();
    expect(event.allDay).toBeNull();
    expect(event.location).toBeNull();
    expect(event.reccurrenceRule).toBeNull();
    expect(event.meetingUrl).toBeNull();
    expect(event.color).toBeNull();
  });

  it('stores the provided optional fields', async () => {
    const event = await eventsService.createEvent({
      title: 'Full',
      description: 'Details',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
      allDay: false,
      location: 'Room 1',
      reccurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      meetingUrl: 'https://example.com/meet',
      color: '#00ff00',
    });
    expect(event.description).toBe('Details');
    expect(event.allDay).toBe(false);
    expect(event.location).toBe('Room 1');
    expect(event.reccurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(event.meetingUrl).toBe('https://example.com/meet');
    expect(event.color).toBe('#00ff00');
  });

  it('throws when endAt is before startAt', async () => {
    await expect(
      eventsService.createEvent({
        title: 'Backwards',
        startAt: new Date('2026-06-10T11:00:00.000Z'),
        endAt: new Date('2026-06-10T10:00:00.000Z'),
      }),
    ).rejects.toThrow(/endAt must not be before startAt/i);
  });
});

describe('EventService — getById', () => {
  it('returns the event for a valid id', async () => {
    const created = await eventsService.createEvent({
      title: 'Find me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const found = await eventsService.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe('Find me');
  });

  it('returns null for an unknown id', async () => {
    const result = await eventsService.getById(generateId('event'));
    expect(result).toBeNull();
  });
});

describe('EventService — getByIds', () => {
  it('returns all events matching the provided ids', async () => {
    const a = await eventsService.createEvent({
      title: 'A',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const b = await eventsService.createEvent({
      title: 'B',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    await eventsService.createEvent({
      title: 'C',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    }); // not requested

    const result = await eventsService.getByIds([a.id, b.id]);
    expect(result).toHaveLength(2);
    const ids = result.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('returns an empty array when none of the ids match', async () => {
    const result = await eventsService.getByIds([generateId('event'), generateId('event')]);
    expect(result).toHaveLength(0);
  });
});

describe('EventService — updateEvent', () => {
  it('updates the title', async () => {
    const event = await eventsService.createEvent({
      title: 'Old title',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const updated = await eventsService.updateEvent(event.id, { title: 'New title' });
    expect(updated.title).toBe('New title');
  });

  it('persists fields that were not passed', async () => {
    const event = await eventsService.createEvent({
      title: 'Original',
      description: 'Keep me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const updated = await eventsService.updateEvent(event.id, { title: 'Changed' });
    expect(updated.description).toBe('Keep me');
  });

  it('updates startAt and endAt together', async () => {
    const event = await eventsService.createEvent({
      title: 'Move me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    const newStart = new Date('2026-06-11T14:00:00.000Z');
    const newEnd = new Date('2026-06-11T15:00:00.000Z');
    const updated = await eventsService.updateEvent(event.id, {
      startAt: newStart,
      endAt: newEnd,
    });
    expect(updated.startAt.getTime()).toBe(newStart.getTime());
    expect(updated.endAt.getTime()).toBe(newEnd.getTime());
  });

  it('throws when moving endAt alone before the existing startAt', async () => {
    const event = await eventsService.createEvent({
      title: 'Event',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    await expect(
      eventsService.updateEvent(event.id, { endAt: new Date('2026-06-10T09:00:00.000Z') }),
    ).rejects.toThrow(/endAt must not be before startAt/i);
  });

  it('throws when moving startAt alone past the existing endAt', async () => {
    const event = await eventsService.createEvent({
      title: 'Event',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    await expect(
      eventsService.updateEvent(event.id, { startAt: new Date('2026-06-10T12:00:00.000Z') }),
    ).rejects.toThrow(/endAt must not be before startAt/i);
  });

  it('clears reccurrenceRule when explicitly set to null', async () => {
    const event = await eventsService.createEvent({
      title: 'Recurring',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
      reccurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const updated = await eventsService.updateEvent(event.id, { reccurrenceRule: null });
    expect(updated.reccurrenceRule).toBeNull();
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(
      eventsService.updateEvent(generateId('event'), { title: 'Ghost' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EventService — deleteEvent', () => {
  it('deletes an existing event', async () => {
    const event = await eventsService.createEvent({
      title: 'Delete me',
      startAt: new Date('2026-06-10T10:00:00.000Z'),
      endAt: new Date('2026-06-10T11:00:00.000Z'),
    });
    await eventsService.deleteEvent(event.id);
    expect(await eventsService.getById(event.id)).toBeNull();
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(eventsService.deleteEvent(generateId('event'))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('EventService — listEventsInRange', () => {
  it('includes a non-recurring event fully inside the range', async () => {
    const event = await eventsService.createEvent({
      title: 'Inside',
      startAt: hoursAfter(RANGE_START, 2),
      endAt: hoursAfter(RANGE_START, 3),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that starts before the range and ends inside it', async () => {
    const event = await eventsService.createEvent({
      title: 'Straddles start',
      startAt: hoursAfter(RANGE_START, -6), // day before, 6pm
      endAt: hoursAfter(RANGE_START, 2),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that starts inside the range and ends after it', async () => {
    const event = await eventsService.createEvent({
      title: 'Straddles end',
      startAt: hoursAfter(RANGE_START, 20),
      endAt: hoursAfter(RANGE_START, 30), // spills into the next day
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('includes a non-recurring event that spans the entire range', async () => {
    const event = await eventsService.createEvent({
      title: 'Multi-day conference',
      startAt: hoursAfter(RANGE_START, -24),
      endAt: hoursAfter(RANGE_START, 48),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('excludes a non-recurring event entirely before the range', async () => {
    const event = await eventsService.createEvent({
      title: 'Yesterday',
      startAt: hoursAfter(RANGE_START, -5),
      endAt: hoursAfter(RANGE_START, -2),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('excludes a non-recurring event entirely after the range', async () => {
    const event = await eventsService.createEvent({
      title: 'Tomorrow',
      startAt: hoursAfter(RANGE_END, 2),
      endAt: hoursAfter(RANGE_END, 3),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('includes a recurring event whose anchor start falls before the range end', async () => {
    // e.g. a weekly standup that started long before this particular week
    const event = await eventsService.createEvent({
      title: 'Weekly standup',
      startAt: new Date('2025-01-06T10:00:00.000Z'),
      endAt: new Date('2025-01-06T10:30:00.000Z'),
      reccurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).toContain(event.id);
  });

  it('excludes a recurring event whose anchor start is after the range end', async () => {
    const event = await eventsService.createEvent({
      title: 'Future series',
      startAt: hoursAfter(RANGE_END, 24),
      endAt: hoursAfter(RANGE_END, 24.5),
      reccurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result.map((e) => e.id)).not.toContain(event.id);
  });

  it('orders results by startAt ascending', async () => {
    const later = await eventsService.createEvent({
      title: 'Later',
      startAt: hoursAfter(RANGE_START, 10),
      endAt: hoursAfter(RANGE_START, 11),
    });
    const earlier = await eventsService.createEvent({
      title: 'Earlier',
      startAt: hoursAfter(RANGE_START, 2),
      endAt: hoursAfter(RANGE_START, 3),
    });
    const result = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(result[0].id).toBe(earlier.id);
    expect(result[1].id).toBe(later.id);
  });
});

describe('EventService — listEventsInRange cursor pagination', () => {
  async function seed(n: number) {
    const created = [];
    for (let i = 0; i < n; i++) {
      // pairs share the same startAt to exercise the id tiebreaker
      const startAt = hoursAfter(RANGE_START, 1 + Math.floor(i / 2));
      created.push(
        await eventsService.createEvent({
          title: `E${i}`,
          startAt,
          endAt: hoursAfter(startAt, 1),
        }),
      );
    }
    return created;
  }

  it('returns a null nextCursor when everything fits', async () => {
    await seed(3);
    const page = await eventsService.listEventsInRange(RANGE_START, RANGE_END);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('pages through all in-range events once, in startAt order, ignoring out-of-range events', async () => {
    await seed(7);
    await eventsService.createEvent({
      title: 'outside',
      startAt: hoursAfter(RANGE_END, 48),
      endAt: hoursAfter(RANGE_END, 49),
    });
    const full = (await eventsService.listEventsInRange(RANGE_START, RANGE_END)).items;
    expect(full).toHaveLength(7);

    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await eventsService.listEventsInRange(RANGE_START, RANGE_END, {
        limit: 3,
        cursor,
      });
      ids.push(...page.items.map((e) => e.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(ids).toEqual(full.map((e) => e.id));
    expect(new Set(ids).size).toBe(7);
  });

  it('rejects invalid limit and garbage cursor', async () => {
    await expect(
      eventsService.listEventsInRange(RANGE_START, RANGE_END, { limit: 0 }),
    ).rejects.toThrow(RangeError);
    await expect(
      eventsService.listEventsInRange(RANGE_START, RANGE_END, { cursor: 'nope' }),
    ).rejects.toThrow(InvalidCursorError);
  });
});
