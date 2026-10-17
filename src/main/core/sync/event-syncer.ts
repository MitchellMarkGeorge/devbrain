import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Auth } from '../integrations/auth';
import {
  CalendarEventPage,
  CalendarSource,
  ChangeTokenExpiredError,
  EventsQuery,
} from '../integrations/providers/provider';
import { ExternalCalendar } from '../integrations/types';
import { EVENT_HISTORY_WINDOW_MS } from './constants';
import { CalendarSyncState, EventCursor, eventCursorSchema } from './event-cursor';
import { selectedOnFirstListing, SyncWriter } from './writer';
import { ActiveSync, combineSummaries, NOTHING_APPLIED, RunContext, Syncer } from './syncer';
import { EventSyncPage, SyncCursor } from './types';

const FRESH: CalendarSyncState = { syncToken: null, pageToken: null };

/**
 * An events source's run: everything about calendars during a sync. Events have no reconcile
 * pass: the provider's feed reports cancellations and deletions.
 *
 * Starting a run
 *
 * Starting lists the account's calendars (CalendarSource.listCalendars) and works out which to
 * sync (calendarsToSync): the selected ones the account still lists, or, on a source's
 * first listing, its primary calendar. Starting writes nothing.
 *
 * How a run goes
 *
 * Each pull fetches one page of one calendar (CalendarSource.getEventPage), and the engine hands
 * each page's nextCursor to the next pull until a page says done. The calendars are walked in the
 * order toSync gives, each one to the end of its pass before the next starts, and the run is done
 * after the last page of the last calendar. A run with A (two pages) and B (one page):
 *
 *   pull  cursor in        fetches       the source says    cursor out
 *   1     no pending       A page 1      nextPageToken      A at page 2, pending [A, B]
 *   2     pending [A, B]   A page 2      changeToken        A synced, pending [B]
 *   3     pending [B]      B page 1      changeToken        B synced, no pending: done
 *
 * The cursor (EventCursor) holds, per calendar:
 *
 * - syncToken: the change token the source handed out at the end of the calendar's last pass.
 *   With one, the next pass asks only for the changes since. Without one, the next pass is a full
 *   one from EVENT_HISTORY_WINDOW_MS back. Each calendar keeps its own, so adding a calendar fully
 *   syncs that one alone.
 * - pageToken: set while a pass is part-way through, so the next pull fetches its next page.
 * - timeMin: set while a full pass is part-way through. It is fixed when the pass starts, so every
 *   page asks the same question: Google expects every parameter but the page token to match
 *   across the pages of a pass.
 *
 * and, at the top, pending: the calendars this run has still to visit, first one being walked.
 * It is absent between runs, which is how a pull knows a new run is starting; it is dropped on
 * the last page.
 *
 * Why one page per pull, rather than a whole calendar or every calendar at once
 *
 * - The engine commits each page together with the cursor after it, in one transaction. A run
 *   cut short (the app closing, an abort, a failure) loses at most the page in flight and the
 *   next run resumes from there, even mid-calendar. Full passes are the long ones, and the ones
 *   most likely to be cut short, e.g. by closing the app during a first sync.
 * - better-sqlite3 is synchronous, so every write blocks the main process. A page of at most
 *   EVENTS_PAGE_SIZE events keeps each transaction within its budget: about 33 ms measured for
 *   250 new events, flat as the table grows, against a budget of 75 ms (see "Database
 *   concurrency" in docs/integrations/tech-design.md). A whole calendar's first sync could be
 *   thousands of rows and hold the main process for seconds. Memory stays bounded the same way.
 * - The engine checks its abort signal and MAX_PAGES_PER_RUN between pulls and reports progress
 *   after each one, so an abort is seen, the cap counts, and progress moves page by page rather
 *   than calendar by calendar.
 * - It is the same unit as a tasks run's page, so one page loop serves both kinds of source.
 *
 * pending lives in the cursor for the same reason: it is committed with each page, so a run that
 * stops between calendars resumes at the calendar it was on.
 *
 * The price is that a pass spans pulls, so an exception of a series can arrive a page before its
 * master. SyncWriter records every exception as it comes, which covers that; see applyEventPage.
 *
 * Only the run's calendars keep progress
 *
 * The next cursor keeps entries only for the calendars of the run, and a resumed run's pending
 * keeps only those. So a deselected calendar's progress goes, and so does that of a calendar the
 * account stopped listing: choosing one again, or one coming back, starts it over with a full
 * pass, which brings back the events removed when it left. With A and C in the run, pending
 * [B, C] and cursor entries for A, B and D:
 *
 *   calendar  in the run  visited this run    entry kept
 *   A         yes         no (done earlier)   yes
 *   B         no          no                  dropped
 *   C         yes         yes                 yes
 *   D         no          no                  dropped
 *
 * An expired change token
 *
 * When the source throws ChangeTokenExpiredError (Google's 410: the sync token or page token is no
 * longer accepted), that calendar alone starts a full pass, in the same pull; the others keep their
 * tokens. A second one in a row is not caught, and fails the run. SyncWriter matches events by
 * external id, so the full pass duplicates nothing and linked notes stay linked.
 *
 * Applying
 *
 * Applying the run's first page also does the run's calendar work, in the same transaction as the
 * page and its cursor:
 *
 * 1. Remove the events of calendars the user deselected (CalendarService.setSelected) by the
 *    removal rule. Their progress goes with them: the page's next cursor, saved in this
 *    transaction, keeps none for calendars outside the run, so selecting one again is a full pass
 *    that brings its events back.
 * 2. Store the listing as calendar rows (SyncWriter.applyCalendarList), keeping names, colours and
 *    zones current. A source's first listing selects its primary calendar.
 *
 * Every page is then applied to its calendar's row by SyncWriter.applyEventPage. A run that fails
 * before its first page is applied writes nothing, so a deselected calendar keeps its events, and
 * its progress, until a run gets that far.
 *
 * A run syncs the calendars it chose when it started: a selection changed during a run takes
 * effect at the next one, which removes a calendar deselected meanwhile.
 *
 * Stateless
 *
 * One source instance serves every connected account, and their runs may interleave, so nothing
 * of a run is kept on the source or on this syncer: the run's calendars come with every pull, and
 * progress is in the cursor. (An earlier version cached the calendar list on the provider, which
 * let one account's run use another account's list.)
 */
export class EventSyncer implements Syncer {
  readonly cursorSchema = eventCursorSchema;

  constructor(
    // Subject to change: for the two calendar reads at the bottom of this class. Syncers should
    // not hold a database handle; the reads are expected to move to a sync-side reader (see
    // docs/follow-ups.md).
    private readonly db: BetterSQLite3Database,
    private readonly writer: SyncWriter,
    private readonly calendars: CalendarSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async start({ sourceId, auth, cursor, signal }: RunContext): Promise<ActiveSync<EventSyncPage>> {
    const listed = await this.calendars.listCalendars(auth, { signal });
    const calendarsToSync = this.calendarsToSync(sourceId, listed);
    let calendarWorkDone = false;

    return {
      cursor,
      pull: (current) => this.pull(auth, current, calendarsToSync, signal),
      apply: (page) => {
        let summary = NOTHING_APPLIED;
        if (!calendarWorkDone) {
          // 1-2, once per run, with its first page
          summary = combineSummaries(
            this.writer.removeDeselectedCalendars(sourceId),
            this.writer.applyCalendarList(sourceId, listed),
          );
          calendarWorkDone = true;
        }

        // nothing was fetched, e.g. no calendar is selected: only the cursor is saved
        if (page.calendarExternalId === null) return summary;
        const calendarId = this.rowIdOf(sourceId, page.calendarExternalId);
        if (calendarId === undefined) {
          throw new Error('The run fetched a page of a calendar it does not sync');
        }
        return combineSummaries(summary, this.writer.applyEventPage(sourceId, calendarId, page));
      },
    };
  }

  /**
   * One page of the calendar at the front of the run's queue; see the class comment.
   *
   * 1. Read the cursor. No pending means a new run.
   * 2. Work out the queue (pending, or every calendar of the run for a new run) and the progress to
   *    keep (the cursor entries of the run's calendars).
   * 3. Fetch the next page of the first calendar in the queue, from its saved state.
   * 4. Build the next cursor: the calendar's page token if its pass goes on, else its new change
   *    token and the queue without it. The run is done when the queue is empty.
   */
  async pull(
    auth: Auth,
    cursor: SyncCursor | null,
    calendars: ExternalCalendar[],
    signal?: AbortSignal,
  ): Promise<EventSyncPage> {
    // 1.
    const current = readCursor(cursor);
    const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));

    // 2.
    const kept: EventCursor['calendars'] = Object.fromEntries(
      Object.entries(current.calendars).filter(([id]) => byId.has(id)),
    );
    const queue =
      current.pending === undefined
        ? calendars.map((calendar) => calendar.id)
        : current.pending.filter((id) => byId.has(id));

    // nothing to visit, e.g. no calendar chosen: the run is done, with nothing fetched
    if (queue.length === 0) {
      return {
        calendarExternalId: null,
        events: [],
        cancelledIds: [],
        skipped: 0,
        done: true,
        nextCursor: { calendars: kept },
      };
    }

    // 3.
    const [calendarId] = queue;
    const { state, page } = await this.fetchPage(auth, calendarId, kept[calendarId], signal);
    // an event the source could give no zone, its own or its calendar's on the page, takes the
    // calendar's zone as listed
    const listedZone = byId.get(calendarId)!.timeZone;
    const events = page.events.map((event) =>
      event.timeZone === null ? { ...event, timeZone: listedZone } : event,
    );

    // 4. the calendar's pass goes on, keeping its place, or it ends with the token for the next
    // run's changes and leaves the queue
    const passDone = page.nextPageToken === null;
    const next: CalendarSyncState = passDone
      ? { syncToken: page.changeToken, pageToken: null }
      : { ...state, pageToken: page.nextPageToken };
    const pending = passDone ? queue.slice(1) : queue;
    const done = pending.length === 0;

    return {
      calendarExternalId: calendarId,
      events,
      cancelledIds: page.cancelledIds,
      skipped: page.skipped,
      done,
      nextCursor: {
        calendars: { ...kept, [calendarId]: next },
        ...(!done && { pending }),
      },
    };
  }

  // One page of one calendar, from where its state left off. On an expired change token the state
  // is dropped and the calendar starts a full pass in its place; a second one in a row is not
  // caught.
  private async fetchPage(
    auth: Auth,
    calendarId: string,
    stored: CalendarSyncState | undefined,
    signal: AbortSignal | undefined,
  ): Promise<{ state: CalendarSyncState; page: CalendarEventPage }> {
    let state = this.withTimeMin(stored ?? FRESH);
    const options = { signal };
    try {
      return {
        state,
        page: await this.calendars.getEventPage(auth, calendarId, query(state), options),
      };
    } catch (error) {
      if (!(error instanceof ChangeTokenExpiredError)) throw error;
      state = this.withTimeMin(FRESH);
      return {
        state,
        page: await this.calendars.getEventPage(auth, calendarId, query(state), options),
      };
    }
  }

  // A full pass fixes its lower bound when it starts and keeps it while it pages, so each page
  // asks the same question. An incremental pass has none.
  private withTimeMin(state: CalendarSyncState): CalendarSyncState {
    if (state.syncToken !== null || state.timeMin !== undefined) return state;
    const timeMin = new Date(this.now().getTime() - EVENT_HISTORY_WINDOW_MS).toISOString();
    return { ...state, timeMin };
  }

  // The two calendar reads below are subject to change: they are here for now, and are expected
  // to move out of the syncer so it holds no database handle (see docs/follow-ups.md).

  /**
   * The calendars a run syncs, as the provider listed them, in the order it visits them: primary
   * first, then by name. A listed calendar with a row syncs when the row is selected; one without
   * a row syncs when the source has no rows yet and its first listing, stored with the run's first
   * page, will select it (its primary calendar). A selected calendar the account no longer lists
   * keeps its row but is left out, so it cannot fail the run.
   */
  private calendarsToSync(
    sourceId: ExternalSourceId,
    listed: ExternalCalendar[],
  ): ExternalCalendar[] {
    const rows = new Map(
      this.db
        .select({ externalId: calendars.externalId, selected: calendars.selected })
        .from(calendars)
        .where(eq(calendars.sourceId, sourceId))
        .all()
        .map((row) => [row.externalId, row.selected]),
    );
    const firstListing = rows.size === 0;
    return listed
      .filter(
        (calendar) => rows.get(calendar.id) ?? (firstListing && selectedOnFirstListing(calendar)),
      )
      .sort(
        (a, b) =>
          Number(b.primary) - Number(a.primary) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      );
  }

  // a calendar's row id, by the provider's id
  private rowIdOf(sourceId: ExternalSourceId, externalId: string): CalendarId | undefined {
    return this.db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(eq(calendars.sourceId, sourceId), eq(calendars.externalId, externalId)))
      .get()?.id;
  }
}

// what to ask the source for, from a calendar's state
function query(state: CalendarSyncState): EventsQuery {
  const pageToken = state.pageToken !== null ? { pageToken: state.pageToken } : {};
  return state.syncToken !== null
    ? { changeToken: state.syncToken, ...pageToken }
    : { from: state.timeMin!, ...pageToken };
}

function readCursor(cursor: SyncCursor | null): EventCursor {
  const parsed = eventCursorSchema.safeParse(cursor);
  // a missing or unreadable cursor gives every calendar a full pass
  return parsed.success ? parsed.data : { calendars: {} };
}
