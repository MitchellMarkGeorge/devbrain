import { CalendarId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { and, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { CredentialStore } from '../integrations/credential-store';
import type { ProviderRegistry } from '../integrations/providers/registry';
import type { IntegrationService } from '../integrations/service';
import { IntegrationAuthError, RateLimitError } from '../shared/errors';
import { consoleLogger, errorClass, Logger } from '../shared/logger';
import { EVENT_HISTORY_WINDOW_MS, MAX_PAGES_PER_RUN } from '../sync/constants';
import { SyncStateManager, syncSkipReason } from '../sync/sync-state';
import type { SyncWriter } from '../sync/writer';

type CalendarRow = typeof calendars.$inferSelect;

export interface EventFetcherOptions {
  db: BetterSQLite3Database;
  credentials: Pick<CredentialStore, 'getAuth'>;
  providers: ProviderRegistry;
  // saves each page as a sync run does, so fetched events are linked, read-only and indexed
  writer: Pick<SyncWriter, 'applyEventPage'>;
  // whether the provider may be asked now, and where a rate limit is recorded
  syncState: Pick<SyncStateManager, 'getSyncTarget' | 'recordSyncOutcome'>;
  // rejected credentials stop the integration until a reconnect, as in a run
  integrations: Pick<IntegrationService, 'markNeedsReauth'>;
  // the workspace closing: cancels a request in flight, and nothing is saved after it
  signal?: AbortSignal;
  logger?: Logger;
  now?: () => Date;
}

/**
 * Fetches synced calendars' events from before the window sync keeps, straight from the
 * provider's calendar source, for EventService.listForCalendar.
 *
 * Sync mirrors a calendar from EVENT_HISTORY_WINDOW_MS back. calendars.historyLoadedFrom records
 * how far back this has fetched it; null means the window alone. For a read that starts earlier,
 * each calendar's gap, from the read's start up to what it has, is listed with a bounded query
 * (timeMin/timeMax, no change token) and saved page by page through SyncWriter.applyEventPage, as
 * a sync run saves a page: matched by external id, linked, read-only and indexed. Once the last
 * page is saved, historyLoadedFrom is lowered to the read's start.
 *
 * It goes through no sync run and never touches the sync cursor, so a run cannot overwrite what it
 * recorded, and the change token stays the calendar's. A full pass after a 410 sweeps only its own
 * window, so it leaves what this saved alone. Deselecting a calendar clears historyLoadedFrom with
 * its events (SyncWriter's removeCalendar), so selecting it again fetches afresh.
 */
export class EventFetcher {
  private readonly logger: Logger;
  private readonly now: () => Date;

  constructor(private readonly options: EventFetcherOptions) {
    this.logger = options.logger ?? consoleLogger;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Brings the events of the selected, visible synced calendars (only those of `calendarIds`, when
   * given) from `from` on into the database, fetching each calendar's gap, and returns the
   * calendars it saved events for. Calendars that already reach back to `from`, and reads inside
   * the window, fetch nothing.
   *
   * Never rejects: a calendar whose fetch fails is logged and left out, and keeps its
   * historyLoadedFrom, so the next read before it tries again.
   */
  async fetchHistory(from: Date, calendarIds?: CalendarId[]): Promise<CalendarId[]> {
    const windowFrom = new Date(this.now().getTime() - EVENT_HISTORY_WINDOW_MS);
    if (from >= windowFrom) return [];
    const fetched = await Promise.all(
      this.calendarsBehind(from, calendarIds).map(async (calendar) => {
        try {
          const until = calendar.historyLoadedFrom ?? windowFrom;
          return (await this.fetchCalendar(calendar, from, until)) ? [calendar.id] : [];
        } catch (error) {
          this.logger.error(
            `Fetching calendar history failed calendar=${calendar.id} error=${errorClass(error)}`,
          );
          return [];
        }
      }),
    );
    return fetched.flat();
  }

  // the selected, visible synced calendars of the read that do not reach back to `from`
  private calendarsBehind(from: Date, calendarIds?: CalendarId[]): CalendarRow[] {
    return this.options.db
      .select()
      .from(calendars)
      .where(
        and(
          isNotNull(calendars.sourceId),
          isNotNull(calendars.externalId),
          eq(calendars.selected, true),
          eq(calendars.visible, true),
          calendarIds ? inArray(calendars.id, calendarIds) : undefined,
          or(isNull(calendars.historyLoadedFrom), gt(calendars.historyLoadedFrom, from)),
        ),
      )
      .all();
  }

  /**
   * One calendar's events in [from, until), page by page, then historyLoadedFrom lowered to `from`.
   * Returns whether it saved anything. Skipped, saving nothing, when nothing may ask the provider
   * now (syncSkipReason: the source or integration off, re-authentication needed, a rate limit).
   * Stops, keeping the pages saved, when the workspace closes or the calendar is deselected
   * meanwhile, since its next sync run removes its events. Rejected credentials and rate limits
   * are recorded as a run's are, then rethrown.
   */
  private async fetchCalendar(calendar: CalendarRow, from: Date, until: Date): Promise<boolean> {
    const { db, credentials, providers, writer, syncState, integrations, signal } = this.options;
    const sourceId = calendar.sourceId!;
    const target = syncState.getSyncTarget(sourceId);
    const source = providers.get(target.provider)?.calendars;
    if (!source || syncSkipReason(target, this.now()) !== null) return false;

    const range = { from: from.toISOString(), until: until.toISOString() };
    let wrote = false;
    try {
      const auth = await credentials.getAuth(target.integrationId);
      let pageToken: string | null = null;
      for (let pages = 0; pages < MAX_PAGES_PER_RUN; pages++) {
        const query = pageToken === null ? range : { ...range, pageToken };
        const page = await source.getEventPage(auth, calendar.externalId!, query, { signal });
        // nothing awaits from here to the write, so neither can change before it
        if (signal?.aborted || !this.isSelected(calendar.id)) return wrote;
        const summary = writer.applyEventPage(sourceId, calendar.id, {
          // an event the provider gave no zone takes its calendar's, as in a sync run
          events: page.events.map((event) =>
            event.timeZone === null ? { ...event, timeZone: calendar.timeZone } : event,
          ),
          cancelledIds: page.cancelledIds,
          skippedIds: page.skippedIds,
          fullPass: null,
        });
        wrote ||= summary.inserted + summary.updated + summary.removed > 0;
        pageToken = page.nextPageToken;
        if (pageToken === null) {
          // only ever lowered: another read may have fetched further back meanwhile
          db.update(calendars)
            .set({ historyLoadedFrom: from })
            .where(
              and(
                eq(calendars.id, calendar.id),
                or(isNull(calendars.historyLoadedFrom), gt(calendars.historyLoadedFrom, from)),
              ),
            )
            .run();
          return wrote;
        }
      }
      throw new Error(`Calendar history went past ${MAX_PAGES_PER_RUN} pages`);
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        integrations.markNeedsReauth(target.integrationId);
      } else if (error instanceof RateLimitError) {
        // the provider's retry time holds back sync runs and the next fetch alike
        syncState.recordSyncOutcome(sourceId, {
          ok: false,
          error: error.message,
          countsAsFailure: false,
          retryAt: error.retryAt,
        });
      }
      throw error;
    }
  }

  private isSelected(calendarId: CalendarId): boolean {
    return (
      this.options.db
        .select({ selected: calendars.selected })
        .from(calendars)
        .where(eq(calendars.id, calendarId))
        .get()?.selected === true
    );
  }
}
