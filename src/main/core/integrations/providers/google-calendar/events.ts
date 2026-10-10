import { ExternalCalendar, ExternalEvent, GoogleEventCursor } from '../../types';
import { googleEventCursorSchema } from '../../schema';
import { Auth } from '../../auth';
import { EventPage, EventSource, SyncCursor } from '../provider';
import { EVENT_HISTORY_WINDOW_MS } from '../../../sync/constants';
import { GoogleCalendarClient, SyncTokenExpiredError } from './client';
import { CalendarContext, externalEventId, toCancelledInstance, toExternalEvent } from './mapper';
import { EventsWindow } from './requests';
import { CANCELLED_STATUS, EventsResponse, eventSchema, eventStubSchema } from './schema';

type CalendarState = GoogleEventCursor['calendars'][string];

const FRESH: CalendarState = { syncToken: null, pageToken: null };

/**
 * The selected calendars as an events source: one page of one calendar per pull.
 *
 * How a run goes
 *
 * SyncEngine lists the account's calendars at the start of the run, then calls pull in a loop,
 * handing each page's nextCursor to the next call, until a page says done. Every call gets the
 * same `calendars`: those selected in the calendars table that the account still lists, with their
 * name, colour and zone from that listing. Each call fetches one events.list page of one calendar.
 * The calendars are walked in that order, each one to the end of its pass before the next starts,
 * and the run is done after the last page of the last calendar. A run with A (two pages) and B
 * (one page):
 *
 *   call  cursor in        request       Google answers    cursor out
 *   1     no pending       A page 1      nextPageToken     A at page 2, pending [A, B]
 *   2     pending [A, B]   A page 2      nextSyncToken     A synced, pending [B]
 *   3     pending [B]      B page 1      nextSyncToken     B synced, no pending: done
 *
 * The cursor (GoogleEventCursor) holds, per calendar:
 *
 * - syncToken: the token Google issued at the end of the calendar's last full pass or change
 *   walk. With one, the next pass asks only for the changes since. Without one, the next pass
 *   is a full one from EVENT_HISTORY_WINDOW_MS back (timeMin). Each calendar keeps its own, so
 *   adding a calendar fully syncs that one alone.
 * - pageToken: set while a pass is part-way through, so the next call fetches its next page.
 * - timeMin: set while a full pass is part-way through. It is fixed when the pass starts, so
 *   every page sends the same bound: Google expects every parameter but the page token to match
 *   across the pages of a pass.
 *
 * and, at the top, pending: the calendars this run has still to visit, first one being walked.
 * It is absent between runs, which is how a call knows a new run is starting; it is dropped on
 * the last page.
 *
 * Why one page per call, rather than a whole calendar or every calendar at once
 *
 * - The engine commits each page together with the cursor after it, in one transaction. A run
 *   cut short (the app closing, an abort, a failure) loses at most the page in flight and the
 *   next run resumes from there, even mid-calendar. Full passes are the long ones, and the ones
 *   most likely to be cut short, e.g. by closing the app during a first sync.
 * - better-sqlite3 is synchronous, so every write blocks the main process. A page of at most
 *   EVENTS_PAGE_SIZE events keeps each transaction to a few milliseconds; a whole calendar's
 *   first sync could be thousands of rows. Memory stays bounded the same way.
 * - The engine checks its abort signal and MAX_PAGES_PER_RUN between calls and reports progress
 *   after each one, so an abort is seen, the cap counts, and progress moves page by page rather
 *   than calendar by calendar.
 * - It is the same unit as TaskSource.pull, so one page loop shape serves both kinds of source.
 *
 * pending lives in the cursor for the same reason: it is committed with each page, so a run that
 * stops between calendars resumes at the calendar it was on.
 *
 * The price is that a pass spans calls, so an exception of a series can arrive a page before its
 * master. SyncWriter records every exception as it comes, which covers that; see applyEventPage.
 *
 * Stateless
 *
 * One instance serves every connected Google account, and their runs may interleave, so nothing
 * is kept between calls: the calendars come in with every call, and progress is in the cursor.
 * (An earlier version cached the calendar list on the instance, which let one account's run use
 * another account's list.)
 *
 * Other rules
 *
 * - A calendar the account no longer lists is not passed in (the engine leaves it out), so it
 *   cannot fail the run for the others.
 * - A 410 means Google no longer accepts a calendar's sync token (or page token). That calendar
 *   alone starts a full pass, in the same call; the others keep their tokens. SyncWriter matches
 *   events by external id, so the full pass duplicates nothing and linked notes stay linked.
 */
export class GoogleEventSource implements EventSource {
  constructor(
    private readonly client: GoogleCalendarClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * One page of the calendar at the front of the run's queue; see the class comment.
   *
   * 1. Read the cursor. No pending means a new run.
   * 2. Work out the queue (pending, or every calendar passed in for a new run) and the progress to
   *    keep (the cursor entries of the calendars passed in).
   * 3. Fetch the next page of the first calendar in the queue, from its saved state.
   * 4. Map the page's entries.
   * 5. Build the next cursor: the calendar's page token if its pass goes on, else its new sync
   *    token and the queue without it. The run is done when the queue is empty.
   */
  async pull(
    auth: Auth,
    cursor: SyncCursor | null,
    calendars: ExternalCalendar[],
  ): Promise<EventPage> {
    // 1.
    const current = readCursor(cursor);
    const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));

    // 2. The calendars passed in are the run's: selected, and still listed by the account. Only
    // their cursor entries are kept, so a deselected calendar's entry is dropped and choosing it
    // again is a full pass, which brings back the events removed when it was deselected
    // (setCalendars already drops it; this also cleans a cursor saved before that). A calendar
    // the account stopped listing loses its entry the same way, and gets a full pass if it
    // returns. A resumed run's queue keeps only what is still passed in.
    //
    // For example, with A and C passed in, pending [B, C] and cursor entries for A, B and D:
    //
    //   calendar  passed in  visited this run  entry kept
    //   A         yes        no (done earlier)  yes
    //   B         no         no                 dropped
    //   C         yes        yes                yes
    //   D         no         no                 dropped
    const kept: GoogleEventCursor['calendars'] = Object.fromEntries(
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
    const { state, response } = await this.pullCalendar(auth, calendarId, kept[calendarId]);
    // 4.
    const page = mapEvents(response.items, {
      calendarId,
      timeZone: response.timeZone ?? byId.get(calendarId)!.timeZone,
    });

    // 5. Google sends nextPageToken on every page of a pass but the last, and nextSyncToken on the
    // last only. So the calendar's pass goes on, keeping its place, or it ends with the token for
    // the next run's changes and leaves the queue
    const passDone = response.nextPageToken === undefined;
    const next: CalendarState = passDone
      ? { syncToken: response.nextSyncToken ?? null, pageToken: null }
      : { ...state, pageToken: response.nextPageToken! };
    const pending = passDone ? queue.slice(1) : queue;
    const done = pending.length === 0;

    return {
      calendarExternalId: calendarId,
      ...page,
      done,
      nextCursor: {
        calendars: { ...kept, [calendarId]: next },
        ...(!done && { pending }),
      },
    };
  }

  listCalendars(auth: Auth): Promise<ExternalCalendar[]> {
    return this.client.listCalendars(auth);
  }

  // One page of one calendar, from where its state left off. On a 410 the state is dropped and
  // the calendar starts a full pass in its place; a second 410 in a row is not caught.
  private async pullCalendar(
    auth: Auth,
    calendarId: string,
    stored: CalendarState | undefined,
  ): Promise<{ state: CalendarState; response: EventsResponse }> {
    let state = this.withTimeMin(stored ?? FRESH);
    try {
      return { state, response: await this.listEvents(auth, calendarId, state) };
    } catch (error) {
      if (!(error instanceof SyncTokenExpiredError)) throw error;
      state = this.withTimeMin(FRESH);
      return { state, response: await this.listEvents(auth, calendarId, state) };
    }
  }

  private listEvents(auth: Auth, calendarId: string, state: CalendarState) {
    const window: EventsWindow =
      state.syncToken !== null ? { syncToken: state.syncToken } : { timeMin: state.timeMin! };
    return this.client.listEvents(auth, calendarId, window, state.pageToken);
  }

  // A full pass fixes its lower bound when it starts and keeps it while it pages, so each page
  // asks the same question. An incremental pass has none.
  private withTimeMin(state: CalendarState): CalendarState {
    if (state.syncToken !== null || state.timeMin !== undefined) return state;
    const timeMin = new Date(this.now().getTime() - EVENT_HISTORY_WINDOW_MS).toISOString();
    return { ...state, timeMin };
  }
}

function readCursor(cursor: SyncCursor | null): GoogleEventCursor {
  const parsed = googleEventCursorSchema.safeParse(cursor);
  // a missing or unreadable cursor gives every calendar a full pass
  return parsed.success ? parsed.data : { calendars: {} };
}

interface MappedEvents {
  events: ExternalEvent[];
  cancelledIds: string[];
  skipped: number;
}

// validates and maps entries one by one, so a bad entry is skipped instead of failing the page
function mapEvents(items: unknown[], calendar: CalendarContext): MappedEvents {
  const result: MappedEvents = { events: [], cancelledIds: [], skipped: 0 };

  for (const item of items) {
    const stub = eventStubSchema.safeParse(item);
    if (!stub.success) {
      result.skipped++;
      continue;
    }

    if (stub.data.status === CANCELLED_STATUS) {
      const { recurringEventId, originalStartTime } = stub.data;
      if (recurringEventId && originalStartTime) {
        // one occurrence of a series: it comes out of the master
        result.events.push(
          toCancelledInstance({ ...stub.data, recurringEventId, originalStartTime }, calendar),
        );
      } else {
        // a whole event or series
        result.cancelledIds.push(externalEventId(calendar.calendarId, stub.data.id));
      }
      continue;
    }

    const event = eventSchema.safeParse(item);
    if (!event.success) {
      result.skipped++;
      continue;
    }
    result.events.push(toExternalEvent(event.data, calendar));
  }
  return result;
}
