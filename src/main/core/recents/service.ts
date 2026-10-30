import { TaskId } from '@common/ids';
import { eq, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tasks } from '@main/db/schema/tasks';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { NotFoundError } from '../shared/errors';
import { Page, PageOptions } from '../shared/pagination';
import { listByStamp, STAMPED_TABLES, stampedEntityTypeOf } from '../shared/stamped';
import type { RecentEntity, RecentEntityType, RecentId, RecentsFilterOptions } from './types';

// What recording a view changed, for in-process subscribers such as the IPC layer forwarding it to
// the renderer. Sent after the write commits.
export type RecentChange = {
  type: 'viewed';
  entityType: RecentEntityType;
  id: RecentId;
  viewedAt: Date;
};

/**
 * The recently viewed tasks, projects, notes and events, for the sidebar's Recents. Viewing an
 * entity stamps its `viewedAt`; the list is ordered by it, most recent first.
 *
 * Like `favoritedAt`, `viewedAt` belongs to DevBrain, never to a provider (SyncWriter leaves it
 * alone), and stamping it leaves `updatedAt` as it was: a view is not an edit, and must not move
 * the entity in the lists sorted by last update.
 *
 * An archived entity keeps its `viewedAt`, but is left out of listRecents until it is restored. A
 * deleted one leaves the list with its row.
 */
export class RecentsService {
  private readonly changes = new ChangeListeners<RecentChange>('Recents');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<RecentChange>): () => void {
    return this.changes.add(listener);
  }

  /**
   * Stamps the entity's `viewedAt` with now, whichever of the four types its id names, and returns
   * its summary as listRecents shows it. Every call stamps, so viewing an entity again moves it back
   * to the top.
   */
  recordView(id: RecentId): RecentEntity {
    const entityType = stampedEntityTypeOf(id);
    // the four tables share the columns written and returned here, so the table, and the id with
    // it, are typed as the tasks table's
    const table = STAMPED_TABLES[entityType] as typeof tasks;
    const row = this.db
      .update(table)
      // updatedAt is set to what it was, or its $onUpdate would stamp it with now
      .set({ viewedAt: new Date(), updatedAt: sql`${table.updatedAt}` })
      .where(eq(table.id, id as TaskId))
      .returning({ title: table.title, viewedAt: table.viewedAt })
      .get();
    if (!row) throw new NotFoundError(id);

    const viewedAt = row.viewedAt!;
    this.changes.emit({ type: 'viewed', entityType, id, viewedAt });
    return { id, entityType, title: row.title, viewedAt };
  }

  /**
   * Every viewed task, project, note and event as one list, most recently viewed first: the query
   * behind the sidebar's Recents. Paginated with an opaque cursor like the other list methods, and
   * optionally narrowed to one entity type; the sidebar asks for one short page.
   *
   * Left out: archived tasks, projects and notes, and events whose provider item was cancelled or
   * deleted (link state `removed`), which are kept only for the notes linked to them.
   */
  listRecents(filter: RecentsFilterOptions = {}, page: PageOptions = {}): Page<RecentEntity> {
    return listByStamp(this.db, 'viewedAt', filter.entityType ?? 'all', page);
  }
}
