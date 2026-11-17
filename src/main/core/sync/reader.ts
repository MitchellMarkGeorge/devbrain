import { CalendarId, ExternalSourceId } from '@common/ids';
import { calendars } from '@main/db/schema/calendars';
import { externalLinks } from '@main/db/schema/integrations';
import { tasks as tasksTable } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { LinkState, TaskStatus } from '@common/types';
import { ReconcilePlan } from './types';

// a calendar row as sync reads it
export interface CalendarRowRef {
  id: CalendarId;
  externalId: string;
  selected: boolean;
}

/**
 * The read side of SyncWriter: every read sync makes of the mirrored rows, so syncers and the
 * reconciler hold a reader and a writer, never a database handle. Reads only, through the
 * workspace's one connection, so a read made inside the engine's transaction sees that
 * transaction's writes.
 */
export class SyncReader {
  constructor(private readonly db: BetterSQLite3Database) {}

  /** the source's calendar rows, by the provider's calendar id */
  calendars(sourceId: ExternalSourceId): CalendarRowRef[] {
    return this.db
      .select({ id: calendars.id, externalId: calendars.externalId, selected: calendars.selected })
      .from(calendars)
      .where(and(eq(calendars.sourceId, sourceId), isNotNull(calendars.externalId)))
      .all() as CalendarRowRef[];
  }

  /** one calendar row of the source, by the provider's id */
  calendar(sourceId: ExternalSourceId, externalId: string): CalendarRowRef | undefined {
    return this.db
      .select({ id: calendars.id, externalId: calendars.externalId, selected: calendars.selected })
      .from(calendars)
      .where(and(eq(calendars.sourceId, sourceId), eq(calendars.externalId, externalId)))
      .get() as CalendarRowRef | undefined;
  }

  /** a calendar row of the source by its own id; undefined for another source's or a local one */
  calendarById(sourceId: ExternalSourceId, calendarId: CalendarId): CalendarRowRef | undefined {
    const row = this.db
      .select({ id: calendars.id, externalId: calendars.externalId, selected: calendars.selected })
      .from(calendars)
      .where(and(eq(calendars.id, calendarId), eq(calendars.sourceId, sourceId)))
      .get();
    return row?.externalId ? (row as CalendarRowRef) : undefined;
  }

  /**
   * What a reconcile pass has to look up, given the ids of the open items assigned to the viewer
   * now (see TaskReconciler.reconcile).
   *
   * - candidates: watched links (synced, not settled, task still open locally) missing from the
   *   snapshot, so reassigned, deleted or trashed since the last run, or closed in a way the
   *   incremental query has not seen yet
   * - returning: snapshot ids with no synced link: a `removed` link (e.g. restored from the trash,
   *   which leaves updatedAt alone) or none yet. A detached link is the user's own and is skipped
   * - projectIds: this source's synced projects, so one edited or deleted in the provider is
   *   noticed
   */
  reconcilePlan(sourceId: ExternalSourceId, assignedIds: string[]): ReconcilePlan {
    const assigned = new Set(assignedIds);
    // served by idx_external_links_source_id_state, then the tasks primary key
    const watched = this.db
      .select({ externalId: externalLinks.externalId })
      .from(externalLinks)
      .innerJoin(tasksTable, eq(tasksTable.id, externalLinks.taskId))
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNull(externalLinks.settledAt),
          notInArray(tasksTable.status, CLOSED_STATUSES),
        ),
      )
      .all();
    const candidates = watched
      .map((link) => link.externalId)
      .filter((externalId) => !assigned.has(externalId));

    // the snapshot's links, by uq_external_links_source_external_id
    const known = new Map<string, LinkState>();
    for (const batch of chunks([...assigned])) {
      const links = this.db
        .select({ externalId: externalLinks.externalId, state: externalLinks.state })
        .from(externalLinks)
        .where(and(eq(externalLinks.sourceId, sourceId), inArray(externalLinks.externalId, batch)))
        .all();
      links.forEach((link) => known.set(link.externalId, link.state));
    }
    const returning = [...assigned].filter((externalId) => {
      const state = known.get(externalId);
      return state === undefined || state === LinkState.REMOVED;
    });

    // served by idx_external_links_source_id_state
    const projectLinks = this.db
      .select({ externalId: externalLinks.externalId })
      .from(externalLinks)
      .where(
        and(
          eq(externalLinks.sourceId, sourceId),
          eq(externalLinks.state, LinkState.SYNCED),
          isNotNull(externalLinks.projectId),
        ),
      )
      .all();

    return { candidates, returning, projectIds: projectLinks.map((link) => link.externalId) };
  }
}

// a closed task is not watched: its issue is out of the open-assignment snapshot by design
const CLOSED_STATUSES = [TaskStatus.COMPLETED, TaskStatus.CANCELLED];

// keeps an id list under SQLite's bound-parameter limit
const CHUNK_SIZE = 500;
function chunks(ids: string[]): string[][] {
  const result: string[][] = [];
  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    result.push(ids.slice(start, start + CHUNK_SIZE));
  }
  return result;
}
