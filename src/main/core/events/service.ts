import { EventId } from '@common/ids';
import { events } from '@main/db/schema/events';
import { and, eq, gte, inArray, isNotNull, isNull, lte, not, or } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { NotFoundError } from '../shared/errors';
import { CreateEventOptions, Event, UpdateEventOptions } from './types';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { ExternalRefs, hasLinkInState } from '../integrations/refs';
import { LinkState } from '../integrations/types';

export class EventService {
  private readonly refs: ExternalRefs;

  constructor(private readonly db: BetterSQLite3Database) {
    this.refs = new ExternalRefs(db);
  }

  async getById(id: EventId): Promise<Event> {
    const [event] = await this.db.select().from(events).where(eq(events.id, id));
    if (!event) throw new NotFoundError(id);
    return this.refs.withRef(event);
  }

  async getByIds(ids: EventId[]): Promise<Event[]> {
    return this.refs.withRefs(await this.db.select().from(events).where(inArray(events.id, ids)));
  }

  async createEvent(options: CreateEventOptions): Promise<Event> {
    if (options.endAt.getTime() < options.startAt.getTime()) {
      throw new Error('endAt must not be before startAt');
    }

    const newEvent = {
      title: options.title,
      description: options.description ?? null,
      startAt: options.startAt,
      endAt: options.endAt,
      allDay: options.allDay ?? false,
      location: options.location ?? null,
      reccurrenceRule: options.reccurrenceRule ?? null,
      meetingUrl: options.meetingUrl ?? null,
      color: options.color ?? null,
    };

    const [insertedEvent] = await this.db.insert(events).values(newEvent).returning();
    return insertedEvent;
  }

  async updateEvent(id: EventId, updates: UpdateEventOptions): Promise<Event> {
    // only pay for the extra lookup when a date is actually changing —
    // updating just one of startAt/endAt can still put the row in an
    // invalid state relative to whichever bound wasn't touched, so the
    // check has to compare against the *effective* (post-update) pair
    if (updates.startAt !== undefined || updates.endAt !== undefined) {
      // throws NotFoundError when the event does not exist
      const existing = await this.getById(id);

      const effectiveStart = updates.startAt ?? existing.startAt;
      const effectiveEnd = updates.endAt ?? existing.endAt;
      if (effectiveEnd.getTime() < effectiveStart.getTime()) {
        throw new Error('endAt must not be before startAt');
      }
    }

    const [updatedEvent] = await this.db
      .update(events)
      .set(updates)
      .where(eq(events.id, id))
      .returning();
    if (!updatedEvent) throw new NotFoundError(id);
    return updatedEvent;
  }

  async deleteEvent(id: EventId): Promise<void> {
    // events have no archivedAt column (unlike notes/tasks/projects) — this
    // is a hard delete
    const [deleted] = await this.db.delete(events).where(eq(events.id, id)).returning();
    if (!deleted) throw new NotFoundError(id);
  }

  /**
   * Returns events that may occur within [start, end] — the single query
   * behind month/week/day views alike; the caller computes whichever
   * window the active view needs and passes it in.
   *
   * Recurring rows are returned un-expanded (their stored startAt/endAt is
   * just the series' anchor occurrence, not every instance) and filtered
   * loosely: a series can't produce an occurrence before its own anchor
   * start, but whether it's *still* recurring by `start` depends on
   * evaluating the rule's UNTIL/COUNT, which is left to the caller's RRULE
   * expansion (e.g. FullCalendar's rrule plugin) rather than reimplemented
   * here. That means a long-ended recurring series can be over-fetched
   * harmlessly — it'll just expand to zero instances in range.
   *
   * Events whose provider item was cancelled or deleted (link state `removed`) are kept only for
   * the notes linked to them, and are left out of the calendar.
   */
  async listEventsInRange(start: Date, end: Date, page: PageOptions = {}): Promise<Page<Event>> {
    const pager = keyset<Event>(
      {
        sortKey: 'startAt',
        sortColumn: events.startAt,
        idColumn: events.id,
        direction: 'asc',
        sortValue: (row) => row.startAt,
        id: (row) => row.id,
      },
      page,
    );

    const rows = await this.db
      .select()
      .from(events)
      .where(
        and(
          or(
            // non-recurring: exact interval-overlap test
            and(isNull(events.reccurrenceRule), lte(events.startAt, end), gte(events.endAt, start)),
            // recurring: loose pre-filter, see doc comment above
            and(isNotNull(events.reccurrenceRule), lte(events.startAt, end)),
          ),
          not(hasLinkInState('event', events.id, LinkState.REMOVED)),
          pager.after,
        ),
      )
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit);

    // filled after the page is cut, so the lookup covers only the rows returned
    const result = pager.toPage(rows);
    return { ...result, items: await this.refs.withRefs(result.items) };
  }
}
