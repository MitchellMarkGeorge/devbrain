import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { CredentialStore } from '../integrations/credential-store';
import { IntegrationService } from '../integrations/service';
import { ProviderRegistry } from '../integrations/providers/registry';
import { IntegrationAuthError, InvalidInputError, NotFoundError } from '../shared/errors';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { EVENT_HISTORY_WINDOW_MS, MAX_PAGES_PER_RUN } from '../sync/constants';
import { EventCursor, eventCursorSchema } from '../sync/event-cursor';
import { SyncStateManager, syncSkipReason } from '../sync/sync-state';
import { SyncSkipReason, SyncSummary } from '../sync/types';
import { SyncWriter } from '../sync/writer';

export interface CalendarHistoryChange {
  sourceId: ExternalSourceId;
  summary: SyncSummary;
}

export interface CalendarHistoryResult {
  calendarId: CalendarId;
  loadedFrom: Date | null;
  pages: number;
  skipped: boolean;
  skipReason?: SyncSkipReason;
}

interface HistoryCalendar {
  id: CalendarId;
  sourceId: ExternalSourceId;
  externalId: string;
  timeZone: string | null;
}

/** Loads older Google calendar ranges without changing the incremental sync token. */
export class CalendarHistoryService {
  private readonly changes = new ChangeListeners<CalendarHistoryChange>('Calendar history');
  private readonly queues = new Map<ExternalSourceId, Promise<unknown>>();

  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly syncState: SyncStateManager,
    private readonly credentials: CredentialStore,
    private readonly providers: ProviderRegistry,
    private readonly integrations: IntegrationService,
    private readonly writer: SyncWriter,
    private readonly signal?: AbortSignal,
    private readonly now: () => Date = () => new Date(),
  ) {}

  onChange(listener: ChangeListener<CalendarHistoryChange>): () => void {
    return this.changes.add(listener);
  }

  async whenIdle(): Promise<void> {
    await Promise.allSettled([...this.queues.values()]);
  }

  async ensureRange(start: Date, calendarIds?: CalendarId[]): Promise<CalendarHistoryResult[]> {
    if (Number.isNaN(start.getTime())) throw new InvalidInputError('Invalid calendar history date');
    const rows = this.rows(calendarIds);
    const requestedIds = calendarIds ? [...new Set(calendarIds)] : undefined;
    if (requestedIds && rows.length !== requestedIds.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = requestedIds.find((id) => !found.has(id));
      throw new NotFoundError(missing!);
    }
    return Promise.all(rows.map((row) => this.enqueue(row.sourceId, () => this.load(row, start))));
  }

  private rows(calendarIds?: CalendarId[]): HistoryCalendar[] {
    return this.db
      .select({
        id: calendars.id,
        sourceId: calendars.sourceId,
        externalId: calendars.externalId,
        timeZone: calendars.timeZone,
      })
      .from(calendars)
      .where(
        and(
          isNotNull(calendars.sourceId),
          isNotNull(calendars.externalId),
          eq(calendars.selected, true),
          calendarIds ? inArray(calendars.id, calendarIds) : eq(calendars.visible, true),
        ),
      )
      .all() as HistoryCalendar[];
  }

  private enqueue<T>(sourceId: ExternalSourceId, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sourceId) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(action);
    this.queues.set(sourceId, result);
    void result.then(
      () => {
        if (this.queues.get(sourceId) === result) this.queues.delete(sourceId);
      },
      () => {
        if (this.queues.get(sourceId) === result) this.queues.delete(sourceId);
      },
    );
    return result;
  }

  private async load(row: HistoryCalendar, requested: Date): Promise<CalendarHistoryResult> {
    const target = this.syncState.getSyncTarget(row.sourceId);
    const blocked = syncSkipReason(target, this.now());
    if (blocked) {
      return { calendarId: row.id, loadedFrom: null, pages: 0, skipped: true, skipReason: blocked };
    }
    // A normal first pass establishes the recent boundary and the incremental token. Backfill
    // before it would race that pass and has no stable upper boundary.
    if (target.initialSyncCompletedAt === null) {
      return {
        calendarId: row.id,
        loadedFrom: null,
        pages: 0,
        skipped: true,
        skipReason: SyncSkipReason.INITIAL_SYNC_PENDING,
      };
    }
    const provider = this.providers.get(target.provider);
    if (!provider?.calendars) {
      return {
        calendarId: row.id,
        loadedFrom: null,
        pages: 0,
        skipped: true,
        skipReason: SyncSkipReason.UNSUPPORTED,
      };
    }
    const parsed = eventCursorSchema.safeParse(target.cursor);
    if (!parsed.success) throw new InvalidInputError('Calendar sync cursor is unavailable');
    const cursor = parsed.data;
    const state = cursor.calendars[row.externalId];
    if (!state) throw new InvalidInputError('Calendar has no completed sync state');
    const fallback = new Date(
      target.initialSyncCompletedAt.getTime() - EVENT_HISTORY_WINDOW_MS,
    ).toISOString();
    const coveredFrom = state.historyFrom ?? fallback;
    const from = requested.toISOString();
    if (from >= coveredFrom) {
      return { calendarId: row.id, loadedFrom: new Date(coveredFrom), pages: 0, skipped: false };
    }

    try {
      const auth = await this.credentials.getAuth(target.integrationId);
      let pageToken: string | undefined;
      let pages = 0;
      do {
        if (this.signal?.aborted) throw this.signal.reason ?? new Error('Calendar history aborted');
        if (pages >= MAX_PAGES_PER_RUN) {
          throw new InvalidInputError(`Calendar history exceeded ${MAX_PAGES_PER_RUN} pages`);
        }
        const page = await provider.calendars.getEventPage(
          auth,
          row.externalId,
          { from, to: coveredFrom, ...(pageToken && { pageToken }) },
          { signal: this.signal },
        );
        if (this.signal?.aborted) throw this.signal.reason ?? new Error('Calendar history aborted');
        if (!this.isStillSelected(row)) {
          return {
            calendarId: row.id,
            loadedFrom: null,
            pages,
            skipped: true,
            skipReason: SyncSkipReason.SOURCE_DISABLED,
          };
        }
        const summary = this.writer.applyEventPage(row.sourceId, row.id, {
          events: page.events.map((event) =>
            event.timeZone === null ? { ...event, timeZone: row.timeZone } : event,
          ),
          cancelledIds: page.cancelledIds,
          skippedIds: page.skippedIds,
          fullPass: null,
        });
        pages++;
        this.changes.emit({ sourceId: row.sourceId, summary });
        pageToken = page.nextPageToken ?? undefined;
      } while (pageToken);

      // Merge into the cursor as it is now, not the snapshot from before the network calls. A
      // normal incremental pass may have advanced its token while this bounded read was paging.
      const latest = eventCursorSchema.safeParse(this.syncState.getSyncTarget(row.sourceId).cursor);
      if (!latest.success || !latest.data.calendars[row.externalId]) {
        throw new InvalidInputError('Calendar sync cursor changed while history was loading');
      }
      const latestState = latest.data.calendars[row.externalId];
      const next: EventCursor = {
        ...latest.data,
        calendars: {
          ...latest.data.calendars,
          [row.externalId]: {
            ...latestState,
            historyFrom:
              latestState.historyFrom && latestState.historyFrom < from
                ? latestState.historyFrom
                : from,
          },
        },
      };
      this.syncState.saveCursor(row.sourceId, next);
      return { calendarId: row.id, loadedFrom: requested, pages, skipped: false };
    } catch (error) {
      if (error instanceof IntegrationAuthError) {
        this.integrations.markNeedsReauth(target.integrationId);
      }
      throw error;
    }
  }

  private isStillSelected(row: HistoryCalendar): boolean {
    return Boolean(
      this.db
        .select({ id: calendars.id })
        .from(calendars)
        .where(
          and(
            eq(calendars.id, row.id),
            eq(calendars.sourceId, row.sourceId),
            eq(calendars.selected, true),
          ),
        )
        .get(),
    );
  }
}
