import { CalendarId, EventId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { eventExceptions, events } from '@main/db/schema/events';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, not, or, SQL } from 'drizzle-orm';
import { notes } from '@main/db/schema/notes';
import { tasks } from '@main/db/schema/tasks';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { ExternalReadOnlyError, InvalidInputError, NotFoundError } from '../shared/errors';
import {
  CreateEventOptions,
  Event,
  OccurrenceRef,
  OccurrenceScope,
  UpdateEventOptions,
} from './types';
import { addDaysToDate, daysBetween, ruleContinuingFrom, ruleEndingBefore } from './recurrence';
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
  toDateString,
} from '../shared/dates';
import { ChangeListener, ChangeListeners } from '../shared/changes';

type EventRow = typeof events.$inferSelect;

export interface CalendarRangeOptions {
  // only these calendars; every visible one when left out
  calendarIds?: CalendarId[];
}

// Fetches synced calendars' events from `from` on into the database, for a read that reaches back
// before the window sync keeps, and returns the calendars it saved events for: EventFetcher's
// fetchHistory, which the workspace passes in. It never rejects, and returns at once when the
// calendars already reach back that far.
export type FetchHistory = (from: Date, calendarIds?: CalendarId[]) => Promise<CalendarId[]>;

// What a write changed, for in-process subscribers: the workspace keeps search in step, and the IPC
// layer will forward them to the renderer. Sent after the write commits, with the row as written.
// `deleted` carries every row the delete removed: the event, and a series' occurrence rows.
// `events_fetched` names the synced calendars whose older events a read fetched and saved
// (see listForCalendar); SyncWriter indexed them as it saved them.
export type EventChange =
  | { type: 'created'; event: Event }
  | { type: 'updated'; event: Event }
  | { type: 'deleted'; eventIds: EventId[] }
  | { type: 'events_fetched'; calendarIds: CalendarId[] };

export class EventService {
  private readonly changes = new ChangeListeners<EventChange>('Event');

  constructor(
    private readonly db: BetterSQLite3Database,
    // none in tests that read the database alone
    private readonly fetchHistory?: FetchHistory,
  ) {}

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

    if (updates.timeZone !== undefined) checkTimeZone(updates.timeZone);
    const { rest, timing: newTiming } = splitUpdates(existing, updates);
    const set = { ...rest, ...newTiming };

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
    const { eventIds, keptIds } = this.db.transaction((tx) => {
      // a series takes its own occurrence rows with it, but for linked ones; its cancelled ones
      // cascade
      const { deletedIds, keptIds } = removeOccurrenceRows(tx, eq(events.seriesId, id));
      const [deleted] = tx.delete(events).where(eq(events.id, id)).returning().all();
      if (!deleted) throw new NotFoundError(id);
      return { eventIds: [id, ...deletedIds], keptIds };
    });
    this.changes.emit({ type: 'deleted', eventIds });
    this.emitUpdated(keptIds);
  }

  /**
   * Edits one occurrence of a local series, or it and every later one. The whole series is edited
   * with updateEvent.
   *
   * - `this`: the occurrence's own row, made from the series when it has none yet, which adds its
   *   start to the series' exdates. Returns that row. It keeps the series' calendar and has no rule
   *   of its own, so a calendarId or recurrenceRule is refused.
   * - `following`: the series ends just before the occurrence, and a new series made from it and
   *   the updates starts there (at the series' first occurrence, the series itself is updated).
   *   Later occurrence rows and cancelled occurrences move to the new series, their starts shifted
   *   as the occurrence's was. A null recurrenceRule makes the occurrence a one-off and deletes
   *   them. Returns the series that starts at the occurrence.
   */
  updateOccurrence(ref: OccurrenceRef, scope: OccurrenceScope, updates: UpdateEventOptions): Event {
    const series = this.getSeries(ref);
    if (updates.timeZone !== undefined) checkTimeZone(updates.timeZone);
    if (scope === 'this') return this.updateThisOccurrence(series, ref.originalStartAt, updates);
    if (updates.calendarId !== undefined) this.assertLocalCalendar(updates.calendarId);
    return this.updateFollowingOccurrences(series, ref.originalStartAt, updates);
  }

  /**
   * Deletes one occurrence of a local series, or it and every later one. The whole series is
   * deleted with deleteEvent.
   *
   * - `this`: the occurrence is cancelled, and its own row, if it has one, deleted.
   * - `following`: the series ends just before the occurrence, and later occurrence rows and
   *   cancelled occurrences are deleted. At the series' first occurrence, the series is deleted.
   */
  deleteOccurrence(ref: OccurrenceRef, scope: OccurrenceScope): void {
    const series = this.getSeries(ref);
    const at = ref.originalStartAt;
    if (scope === 'following' && at.getTime() === series.startAt.getTime()) {
      return this.deleteEvent(series.id);
    }
    // worked out before the transaction, so a rule that cannot be split writes nothing
    const endingRule =
      scope === 'following' ? ruleEndingBefore(series.recurrenceRule!, series, at) : null;

    const { deletedIds, keptIds } = this.db.transaction((tx) => {
      if (scope === 'this') {
        tx.insert(eventExceptions)
          .values({ seriesId: series.id, originalStartAt: at })
          .onConflictDoNothing()
          .run();
        // the occurrence asked for goes, linked or not, as a one-off event would
        const deletedIds = tx
          .delete(events)
          .where(and(eq(events.seriesId, series.id), eq(events.originalStartAt, at)))
          .returning({ id: events.id })
          .all()
          .map((row) => row.id);
        return { deletedIds, keptIds: [] };
      }
      tx.update(events).set({ recurrenceRule: endingRule }).where(eq(events.id, series.id)).run();
      tx.delete(eventExceptions)
        .where(
          and(eq(eventExceptions.seriesId, series.id), gte(eventExceptions.originalStartAt, at)),
        )
        .run();
      return removeOccurrenceRows(
        tx,
        and(eq(events.seriesId, series.id), gte(events.originalStartAt, at)),
      );
    });

    if (deletedIds.length > 0) this.changes.emit({ type: 'deleted', eventIds: deletedIds });
    this.emitUpdated(keptIds);
    // its exdates or rule changed
    this.changes.emit({ type: 'updated', event: this.getById(series.id) });
  }

  private updateThisOccurrence(series: Event, at: Date, updates: UpdateEventOptions): Event {
    if (updates.recurrenceRule !== undefined) {
      throw new InvalidInputError('An occurrence cannot have a recurrence rule of its own');
    }
    if (updates.calendarId !== undefined && updates.calendarId !== series.calendarId) {
      throw new InvalidInputError("An occurrence stays on its series' calendar");
    }
    const row = this.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.seriesId, series.id), eq(events.originalStartAt, at)))
      .get();
    if (row) return this.updateEvent(row.id, updates);

    const cancelled = this.db
      .select()
      .from(eventExceptions)
      .where(and(eq(eventExceptions.seriesId, series.id), eq(eventExceptions.originalStartAt, at)))
      .get();
    if (cancelled) throw new InvalidInputError('The occurrence was deleted');

    const slot = slotOf(series, at);
    const { rest, timing: newTiming } = splitUpdates(slot, updates);
    const inserted = this.db
      .insert(events)
      .values({
        ...copiedFields(series),
        ...rest,
        ...slot,
        ...newTiming,
        recurrenceRule: null,
        seriesId: series.id,
        originalStartAt: at,
      })
      .returning()
      .get();
    const event: Event = { ...inserted, exdates: [], external: null };
    this.changes.emit({ type: 'created', event });
    // the occurrence's start is now among its exdates
    this.changes.emit({ type: 'updated', event: this.getById(series.id) });
    return event;
  }

  private updateFollowingOccurrences(series: Event, at: Date, updates: UpdateEventOptions): Event {
    const atFirst = at.getTime() === series.startAt.getTime();
    const slot = slotOf(series, at);
    const { rest, timing: newTiming } = splitUpdates(slot, updates);
    const start = { ...slot, ...newTiming };
    // worked out before the transaction, so a rule that cannot be split writes nothing
    const rule =
      updates.recurrenceRule !== undefined
        ? updates.recurrenceRule
        : atFirst
          ? series.recurrenceRule
          : ruleContinuingFrom(series.recurrenceRule!, series, at);
    const endingRule = atFirst ? null : ruleEndingBefore(series.recurrenceRule!, series, at);
    const shift = shiftOf(slot, start);

    const { startingId, createdId, movedIds, deletedIds } = this.db.transaction((tx) => {
      let startingId = series.id;
      let createdId: EventId | null = null;
      if (atFirst) {
        tx.update(events)
          .set({ ...rest, ...start, recurrenceRule: rule })
          .where(eq(events.id, series.id))
          .run();
      } else {
        tx.update(events).set({ recurrenceRule: endingRule }).where(eq(events.id, series.id)).run();
        startingId = createdId = tx
          .insert(events)
          .values({ ...copiedFields(series), ...rest, ...start, recurrenceRule: rule })
          .returning({ id: events.id })
          .get().id;
      }

      const laterRows = tx
        .select({ id: events.id, originalStartAt: events.originalStartAt })
        .from(events)
        .where(and(eq(events.seriesId, series.id), gte(events.originalStartAt, at)))
        .all();
      const laterCancelled = tx
        .delete(eventExceptions)
        .where(
          and(eq(eventExceptions.seriesId, series.id), gte(eventExceptions.originalStartAt, at)),
        )
        .returning()
        .all();
      if (rule === null) {
        const { deletedIds, keptIds } = removeOccurrenceRows(
          tx,
          inArray(
            events.id,
            laterRows.map((row) => row.id),
          ),
        );
        return { startingId, createdId, movedIds: keptIds, deletedIds };
      }
      for (const row of laterRows) {
        tx.update(events)
          .set({
            seriesId: startingId,
            originalStartAt: shift(row.originalStartAt!),
            ...(updates.calendarId !== undefined && { calendarId: updates.calendarId }),
          })
          .where(eq(events.id, row.id))
          .run();
      }
      if (laterCancelled.length > 0) {
        tx.insert(eventExceptions)
          .values(
            laterCancelled.map((row) => ({
              seriesId: startingId,
              originalStartAt: shift(row.originalStartAt),
            })),
          )
          .onConflictDoNothing()
          .run();
      }
      return { startingId, createdId, movedIds: laterRows.map((row) => row.id), deletedIds: [] };
    });

    const starting = this.getById(startingId);
    if (createdId) {
      this.changes.emit({ type: 'updated', event: this.getById(series.id) });
      this.changes.emit({ type: 'created', event: starting });
    } else {
      this.changes.emit({ type: 'updated', event: starting });
    }
    this.emitUpdated(movedIds);
    if (deletedIds.length > 0) this.changes.emit({ type: 'deleted', eventIds: deletedIds });
    return starting;
  }

  private emitUpdated(ids: EventId[]): void {
    for (const event of ids.length > 0 ? this.getByIds(ids) : []) {
      this.changes.emit({ type: 'updated', event });
    }
  }

  // the series an occurrence write is about: a local, recurring one the occurrence can be in
  private getSeries(ref: OccurrenceRef): Event {
    const series = this.getById(ref.seriesId);
    assertRowEditable(series);
    if (series.recurrenceRule === null) {
      throw new InvalidInputError(`Not a recurring event: ${series.id}`);
    }
    if (ref.originalStartAt.getTime() < series.startAt.getTime()) {
      throw new InvalidInputError('The occurrence starts before its series');
    }
    return series;
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
   *
   * Synced calendars are mirrored from EVENT_HISTORY_WINDOW_MS back. When the range starts before
   * what a synced calendar of the read has, that calendar's older events are fetched from its
   * provider and saved first, and the read waits for that before reading the database. Other
   * readers hear of it through `events_fetched`. A fetch that fails is logged and tried again by
   * the next read; this one returns what the database has. Reads inside what is fetched wait on
   * nothing.
   */
  async listForCalendar(
    start: Date,
    end: Date,
    options: CalendarRangeOptions = {},
  ): Promise<Event[]> {
    const fetched = (await this.fetchHistory?.(start, options.calendarIds)) ?? [];
    if (fetched.length > 0) this.changes.emit({ type: 'events_fetched', calendarIds: fetched });
    return this.readRange(start, end, options);
  }

  // the database's events for listForCalendar
  private readRange(start: Date, end: Date, options: CalendarRangeOptions): Event[] {
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

/**
 * Removes the occurrence rows `where` matches, of a series that is going in full or from a start
 * on. A row a note or task links to stays, as a one-off with no series: what `events.seriesId`
 * being set null when its series goes intends. Synchronous, for a transaction.
 */
function removeOccurrenceRows(
  tx: BaseSQLiteDatabase<'sync', RunResult>,
  where: SQL | undefined,
): { deletedIds: EventId[]; keptIds: EventId[] } {
  const ids = tx
    .select({ id: events.id })
    .from(events)
    .where(and(isNotNull(events.seriesId), where))
    .all()
    .map((row) => row.id);
  if (ids.length === 0) return { deletedIds: [], keptIds: [] };
  const linked = new Set<EventId | null>([
    ...tx
      .select({ id: notes.linkedEventId })
      .from(notes)
      .where(inArray(notes.linkedEventId, ids))
      .all()
      .map((row) => row.id),
    ...tx
      .select({ id: tasks.linkedEventId })
      .from(tasks)
      .where(inArray(tasks.linkedEventId, ids))
      .all()
      .map((row) => row.id),
  ]);
  const keptIds = ids.filter((id) => linked.has(id));
  const deletedIds = ids.filter((id) => !linked.has(id));
  if (keptIds.length > 0) {
    tx.update(events)
      .set({ seriesId: null, originalStartAt: null })
      .where(inArray(events.id, keptIds))
      .run();
  }
  if (deletedIds.length > 0) tx.delete(events).where(inArray(events.id, deletedIds)).run();
  return { deletedIds, keptIds };
}

type Timing = Pick<Event, 'startAt' | 'endAt' | 'allDay' | 'startDate' | 'endDate'>;

/**
 * Updates as the columns other than timing, and the timing worked out again from the effective
 * values when any part of it changes, so an all-day event's dates and instants stay in step.
 */
function splitUpdates(existing: Timing, updates: UpdateEventOptions) {
  const { startAt, endAt, allDay, startDate, endDate, ...rest } = updates;
  const timingChanged = [startAt, endAt, allDay, startDate, endDate].some((v) => v !== undefined);
  return {
    rest,
    timing: timingChanged
      ? timing({
          startAt: startAt ?? existing.startAt,
          endAt: endAt ?? existing.endAt,
          allDay: allDay ?? existing.allDay,
          // dates given now win; otherwise kept only while the instants are unchanged
          startDate:
            startDate ?? (startAt === undefined ? (existing.startDate ?? undefined) : undefined),
          endDate: endDate ?? (endAt === undefined ? (existing.endDate ?? undefined) : undefined),
        })
      : undefined,
  };
}

// the timing a series' occurrence at `at` has before any edit: the series' length, from `at`
function slotOf(series: Event, at: Date): Timing {
  if (series.allDay && series.startDate && series.endDate) {
    const startDate = toDateString(at);
    const endDate = addDaysToDate(startDate, daysBetween(series.startDate, series.endDate));
    return {
      startAt: fromDateString(startDate),
      endAt: fromDateString(endDate),
      allDay: true,
      startDate,
      endDate,
    };
  }
  const length = series.endAt.getTime() - series.startAt.getTime();
  return {
    startAt: at,
    endAt: new Date(at.getTime() + length),
    allDay: false,
    startDate: null,
    endDate: null,
  };
}

// what an occurrence row or a series split off takes from its series, besides timing and rule
function copiedFields(series: Event) {
  return {
    calendarId: series.calendarId,
    title: series.title,
    description: series.description,
    timeZone: series.timeZone,
    location: series.location,
    status: series.status,
    response: series.response,
    kind: series.kind,
    meetingUrl: series.meetingUrl,
    color: series.color,
  };
}

// Moves an occurrence's start as an edit moved `from` to `to`: by whole days between all-day
// events, so a local midnight stays one across DST, and by the time between them otherwise.
function shiftOf(from: Timing, to: Timing): (at: Date) => Date {
  if (from.allDay && to.allDay && from.startDate && to.startDate) {
    const days = daysBetween(from.startDate, to.startDate);
    return (at) => fromDateString(addDaysToDate(toDateString(at), days));
  }
  const ms = to.startAt.getTime() - from.startAt.getTime();
  return (at) => new Date(at.getTime() + ms);
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
