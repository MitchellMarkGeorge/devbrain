import { CalendarId, EventId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events } from '@main/db/schema/events';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, not, or } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { ExternalReadOnlyError, InvalidInputError, NotFoundError } from '../shared/errors';
import { CreateEventOptions, Event, UpdateEventOptions } from './types';
import {
  assertEditable,
  assertRowEditable,
  hasLinkInState,
  withExternalRefs,
} from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { DEFAULT_CALENDAR_ID } from '../calendars/types';
import {
  allDayDates,
  fromDateString,
  isDateString,
  isTimeZone,
  localTimeZone,
} from '../shared/dates';
import { ChangeListener, ChangeListeners } from '../shared/changes';

type EventRow = typeof events.$inferSelect;

export interface CalendarRangeOptions {
  // only these calendars; every visible one when left out
  calendarIds?: CalendarId[];
}

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after the write commits, with the row as written.
// `deleted` carries every row the delete removed: the event, and a series' occurrence rows.
export type EventChange =
  | { type: 'created'; event: Event }
  | { type: 'updated'; event: Event }
  | { type: 'deleted'; eventIds: EventId[] };

export class EventService {
  private readonly changes = new ChangeListeners<EventChange>('Event');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<EventChange>): () => void {
    return this.changes.add(listener);
  }

  getById(id: EventId): Event {
    const event = this.db.select().from(events).where(eq(events.id, id)).get();
    if (!event) throw new NotFoundError(id);
    const [withDetails] = this.withDetails([event]);
    return withDetails;
  }

  getByIds(ids: EventId[]): Event[] {
    return this.withDetails(this.db.select().from(events).where(inArray(events.id, ids)).all());
  }

  createEvent(options: CreateEventOptions): Event {
    const calendarId = options.calendarId ?? DEFAULT_CALENDAR_ID;
    // synchronous from this check to the insert, so the calendar cannot become synced or be
    // removed in between
    this.assertLocalCalendar(calendarId);

    const newEvent = {
      calendarId,
      title: options.title,
      description: options.description ?? null,
      ...timing({
        startAt: options.startAt,
        endAt: options.endAt,
        allDay: options.allDay ?? false,
        startDate: options.startDate,
        endDate: options.endDate,
      }),
      timeZone: options.timeZone !== undefined ? checkTimeZone(options.timeZone) : localTimeZone(),
      location: options.location ?? null,
      recurrenceRule: options.recurrenceRule ?? null,
      ...(options.status && { status: options.status }),
      ...(options.kind && { kind: options.kind }),
      meetingUrl: options.meetingUrl ?? null,
      color: options.color ?? null,
    };

    const insertedEvent = this.db.insert(events).values(newEvent).returning().get();
    const event: Event = { ...insertedEvent, exdates: [], external: null };
    this.changes.emit({ type: 'created', event });
    return event;
  }

  /**
   * Updates a local event. The timing is worked out again from the effective values whenever any
   * part of it changes, so an all-day event's dates and instants stay in step.
   */
  updateEvent(id: EventId, updates: UpdateEventOptions): Event {
    // throws NotFoundError when the event does not exist
    const existing = this.getById(id);
    assertRowEditable(existing);
    if (updates.calendarId !== undefined) this.assertLocalCalendar(updates.calendarId);

    const { startAt, endAt, allDay, startDate, endDate, ...rest } = updates;
    if (rest.timeZone !== undefined) checkTimeZone(rest.timeZone);
    const timingChanged = [startAt, endAt, allDay, startDate, endDate].some((v) => v !== undefined);
    const nextAllDay = allDay ?? existing.allDay;
    const set = {
      ...rest,
      ...(timingChanged &&
        timing({
          startAt: startAt ?? existing.startAt,
          endAt: endAt ?? existing.endAt,
          allDay: nextAllDay,
          // dates given now win; otherwise kept only while the instants are unchanged
          startDate:
            startDate ?? (startAt === undefined ? (existing.startDate ?? undefined) : undefined),
          endDate: endDate ?? (endAt === undefined ? (existing.endDate ?? undefined) : undefined),
        })),
    };

    const updatedEvent = this.db.update(events).set(set).where(eq(events.id, id)).returning().get();
    if (!updatedEvent) throw new NotFoundError(id);
    const [withDetails] = this.withDetails([updatedEvent]);
    this.changes.emit({ type: 'updated', event: withDetails });
    return withDetails;
  }

  deleteEvent(id: EventId): void {
    // events have no archivedAt column (unlike notes/tasks/projects) — this
    // is a hard delete
    assertEditable(this.db, id);
    const eventIds = this.db.transaction((tx) => {
      // a series takes its own occurrence rows with it; its cancelled ones cascade
      const occurrences = tx
        .delete(events)
        .where(eq(events.seriesId, id))
        .returning({ id: events.id })
        .all();
      const [deleted] = tx.delete(events).where(eq(events.id, id)).returning().all();
      if (!deleted) throw new NotFoundError(id);
      return [id, ...occurrences.map((row) => row.id)];
    });
    this.changes.emit({ type: 'deleted', eventIds });
  }

  /**
   * Every event of the visible calendars that may occur within [start, end], in one list: what the
   * calendar view hands FullCalendar for its visible range. Unpaginated, since a view's range is
   * bounded. Series come with their exdates.
   *
   * Recurring rows are returned un-expanded (their stored startAt/endAt is just the series' anchor
   * occurrence, not every instance) and filtered loosely: a series can't produce an occurrence
   * before its own anchor start, but whether it's *still* recurring by `start` depends on
   * evaluating the rule's UNTIL/COUNT, which is left to FullCalendar's RRULE expansion rather than
   * reimplemented here. A long-ended series can be over-fetched harmlessly: it expands to zero
   * instances in range.
   *
   * Events whose provider item was cancelled or deleted (link state `removed`) are kept only for
   * the notes linked to them, and are left out of the calendar.
   */
  listForCalendar(start: Date, end: Date, options: CalendarRangeOptions = {}): Event[] {
    const rows = this.db
      .select({ event: events })
      .from(events)
      .innerJoin(calendars, eq(calendars.id, events.calendarId))
      .where(
        and(
          inRange(start, end),
          eq(calendars.visible, true),
          options.calendarIds ? inArray(events.calendarId, options.calendarIds) : undefined,
          not(hasLinkInState('event', events.id, LinkState.REMOVED)),
        ),
      )
      .orderBy(asc(events.startAt), asc(events.id))
      .all();
    return this.withDetails(rows.map((row) => row.event));
  }

  // a calendar events can be written to by the user: one that exists and is not synced
  private assertLocalCalendar(calendarId: CalendarId): void {
    const calendar = this.db
      .select({ sourceId: calendars.sourceId })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .get();
    if (!calendar) throw new NotFoundError(calendarId);
    // a synced calendar's events come from its provider
    if (calendar.sourceId !== null) throw new ExternalReadOnlyError(calendarId);
  }

  private withDetails(rows: EventRow[]): Event[] {
    return withEventDetails(this.db, rows);
  }
}

// An event row as the read model: `external` and `exdates`, each in one batched lookup. Shared with
// services that write an event column of their own, such as FavoritesService. Synchronous, so it
// also runs inside a transaction (`db` can be one).
export function withEventDetails(
  db: BaseSQLiteDatabase<'sync', RunResult>,
  rows: EventRow[],
): Event[] {
  const exdates = exdatesOf(
    db,
    rows.filter((row) => row.recurrenceRule !== null).map((row) => row.id),
  );
  const withExternal = withExternalRefs(db, rows);
  return withExternal.map((row) => ({ ...row, exdates: exdates.get(row.id) ?? [] }));
}

/**
 * What each series no longer has, as FullCalendar's exdate: its cancelled occurrences, and the
 * original starts of its occurrence rows (moved or edited, removed or not), in time order.
 */
function exdatesOf(
  db: BaseSQLiteDatabase<'sync', RunResult>,
  seriesIds: EventId[],
): Map<EventId, Date[]> {
  const exdates = new Map<EventId, Date[]>();
  if (seriesIds.length === 0) return exdates;
  const add = (seriesId: EventId, at: Date) =>
    exdates.set(seriesId, [...(exdates.get(seriesId) ?? []), at]);

  // the cancelled occurrences
  const cancelled = db
    .select()
    .from(eventExceptions)
    .where(inArray(eventExceptions.seriesId, seriesIds))
    .all();
  // the moved or edited occurrences, by the start each replaces
  const occurrences = db
    .select({ seriesId: events.seriesId, originalStartAt: events.originalStartAt })
    .from(events)
    .where(and(inArray(events.seriesId, seriesIds), isNotNull(events.originalStartAt)))
    .all();

  for (const row of cancelled) add(row.seriesId, row.originalStartAt);
  for (const row of occurrences) add(row.seriesId!, row.originalStartAt!);
  // the two lists arrive one after the other, so each series' dates are put in time order
  for (const dates of exdates.values()) dates.sort((a, b) => a.getTime() - b.getTime());
  return exdates;
}

/** the range filter of listForCalendar */
function inRange(start: Date, end: Date) {
  return or(
    // non-recurring: exact interval-overlap test
    and(isNull(events.recurrenceRule), lte(events.startAt, end), gte(events.endAt, start)),
    // recurring: loose pre-filter, see listForCalendar
    and(isNotNull(events.recurrenceRule), lte(events.startAt, end)),
  );
}

// an event's zone must be an IANA name: FullCalendar expands a series in it (DTSTART;TZID=…)
function checkTimeZone(value: string): string {
  if (!isTimeZone(value)) throw new InvalidInputError(`Not an IANA time zone: ${value}`);
  return value;
}

/**
 * An event's timing columns. A timed event keeps its instants and has no dates. An all-day event
 * takes the dates given, or else the local days its instants fall on, and its instants become
 * the starts of those days in the system zone (see shared/dates.ts).
 */
export function timing(input: {
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  startDate?: string;
  endDate?: string;
}) {
  if (!input.allDay) {
    if (input.endAt.getTime() < input.startAt.getTime()) {
      throw new InvalidInputError('endAt must not be before startAt');
    }
    return {
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: false,
      startDate: null,
      endDate: null,
    };
  }

  const derived = allDayDates(input.startAt, input.endAt);
  const startDate = input.startDate ?? derived.startDate;
  const endDate = input.endDate ?? derived.endDate;
  for (const value of [startDate, endDate]) {
    if (!isDateString(value)) throw new InvalidInputError(`Not a date: ${value}`);
  }
  // the end is exclusive, so an all-day event lasts at least one day
  if (endDate <= startDate) throw new InvalidInputError('endDate must be after startDate');
  return {
    startAt: fromDateString(startDate),
    endAt: fromDateString(endDate),
    allDay: true,
    startDate,
    endDate,
  };
}
