import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { and, eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { EventPage, EventSource, SyncCursor } from '../integrations/providers/provider';
import { ExternalCalendar } from '../integrations/types';
import { selectedOnFirstListing, SyncWriter } from './writer';
import { ActiveSync, combineSummaries, NOTHING_APPLIED, RunContext, Syncer } from './syncer';

/**
 * An events source's run: everything about calendars during a sync. Events have no reconcile
 * pass: the provider's feed reports cancellations and deletions.
 *
 * Starting a run lists the account's calendars (EventSource.listExternalCalendars) and works out
 * which to sync: the selected ones the account still lists, or, on a source's first listing, its
 * primary calendar. A selected calendar the account no longer lists keeps its row but is left
 * out, so it cannot fail the run. Starting writes nothing.
 *
 * Every pull is handed those calendars, since a provider keeps nothing between calls, and returns
 * one page of one of them, naming it; the provider's cursor says which calendar and page come
 * next (GoogleEventSource explains why one page at a time).
 *
 * Applying the run's first page also does the run's calendar work, in the same transaction as the
 * page and its cursor:
 *
 * 1. Remove the events of calendars the user deselected (CalendarService.setSelected) by the
 *    removal rule. Their progress goes with them: the provider keeps cursor entries only for the
 *    calendars a pull is handed, so the page's next cursor, saved in this transaction, no longer
 *    has it, and selecting one again is a full pass that brings its events back.
 * 2. Store the listing as calendar rows (SyncWriter.applyCalendarList), keeping names, colours and
 *    zones current. A source's first listing selects its primary calendar.
 *
 * Every page is then applied to its calendar's row by SyncWriter.applyEventPage. A run that fails
 * before its first page is applied writes nothing, so a deselected calendar keeps its events, and
 * its progress, until a run gets that far.
 *
 * A run syncs the calendars it chose when it started: a selection changed during a run takes
 * effect at the next one, which removes a calendar deselected meanwhile.
 */
export class EventSyncer implements Syncer {
  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly writer: SyncWriter,
    private readonly events: EventSource,
    readonly cursorSchema: z.ZodType<SyncCursor>,
  ) {}

  async start({ sourceId, auth, cursor }: RunContext): Promise<ActiveSync<EventPage>> {
    const listed = await this.events.listExternalCalendars(auth);
    const calendarsToSync = this.calendarsToSync(sourceId, listed);
    let calendarWorkDone = false;

    return {
      cursor,
      pull: (current) => this.events.pull(auth, current, calendarsToSync),
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

        // nothing was pulled, e.g. no calendar is selected: only the cursor is saved
        if (page.calendarExternalId === null) return summary;
        const calendarId = this.rowIdOf(sourceId, page.calendarExternalId);
        if (calendarId === undefined) {
          throw new Error('The provider returned a page of a calendar it was not given');
        }
        return combineSummaries(summary, this.writer.applyEventPage(sourceId, calendarId, page));
      },
    };
  }

  // The calendars a run syncs, as the provider listed them, in the order it visits them: primary
  // first, then by name. A listed calendar with a row syncs when the row is selected; one without
  // a row syncs when the source has no rows yet and its first listing, stored with the run's first
  // page, will select it. A selected calendar the account no longer lists is left out.
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
