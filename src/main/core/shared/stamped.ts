import { EventId, isId, NoteId, ProjectId, TaskId } from '@common/ids';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, isNotNull, isNull, not, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { unionAll } from 'drizzle-orm/sqlite-core';
import { hasLinkInState } from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { keyset, Page, PageOptions } from './pagination';

// Lists of tasks, projects, notes and events ordered by a timestamp DevBrain stamps on them:
// favorites by `favoritedAt`, recents by `viewedAt`.

export type StampedEntityType = 'tasks' | 'projects' | 'notes' | 'events';

export type StampedId = TaskId | ProjectId | NoteId | EventId;

/** the timestamp columns a list can be ordered by, with their SQL names */
const STAMP_COLUMNS = { favoritedAt: 'favorited_at', viewedAt: 'viewed_at' } as const;

export type Stamp = keyof typeof STAMP_COLUMNS;

/** a row in a stamped list: the columns the four tables share, and the stamp */
export type StampedEntity<S extends Stamp> = {
  id: StampedId;
  entityType: StampedEntityType;
  title: string;
} & Record<S, Date>;

type ArchivableTable = typeof tasks | typeof projects | typeof notes;
export type StampedTable = ArchivableTable | typeof events;

export const STAMPED_TABLES: Record<StampedEntityType, StampedTable> = {
  tasks,
  projects,
  notes,
  events,
};

/** the entity type an id belongs to, from its prefix */
export function stampedEntityTypeOf(id: StampedId): StampedEntityType {
  if (isId('task', id)) return 'tasks';
  if (isId('project', id)) return 'projects';
  if (isId('note', id)) return 'notes';
  return 'events';
}

/**
 * Every task, project, note and event with `stamp` set as one list, most recent first, or only those
 * of one entity type. Paginated with an opaque cursor like the other list methods.
 *
 * Left out: archived tasks, projects and notes, and events whose provider item was cancelled or
 * deleted (link state `removed`), which are kept only for the notes linked to them. Each table has a
 * partial index on (stamp, id) matching this filter.
 */
export function listByStamp<S extends Stamp>(
  db: BetterSQLite3Database,
  stamp: S,
  entityType: StampedEntityType | 'all',
  page: PageOptions,
): Page<StampedEntity<S>> {
  // one pager per table, with the cursor condition pushed into each branch of the union so each
  // can seek its own (stamp, id) index. ids carry a per-entity prefix, so they are unique across
  // the tables and still a valid tiebreaker.
  const pagerOf = (table: StampedTable) =>
    keyset<StampedEntity<S>>(
      {
        sortKey: stamp,
        sortColumn: table[stamp],
        idColumn: table.id,
        direction: 'desc',
        sortValue: (row) => row[stamp],
        id: (row) => row.id,
      },
      page,
    );

  if (entityType !== 'all') {
    // a single table needs no union, so it can order by its own columns
    const pager = pagerOf(STAMPED_TABLES[entityType]);
    const rows = branch(db, stamp, entityType, pager.after)
      .orderBy(...pager.orderBy)
      .limit(pager.fetchLimit)
      .all();
    return pager.toPage(rows as StampedEntity<S>[]);
  }

  const pager = pagerOf(tasks);
  const branchOf = (type: StampedEntityType) =>
    branch(db, stamp, type, pagerOf(STAMPED_TABLES[type]).after);

  // a compound select resolves ORDER BY against the *result* column names of its left-most
  // branch, so these have to be the bare column names, not pager.orderBy
  const rows = unionAll(
    branchOf('tasks'),
    branchOf('projects'),
    branchOf('notes'),
    branchOf('events'),
  )
    .orderBy(sql.raw(`${STAMP_COLUMNS[stamp]} desc`), sql`id desc`)
    .limit(pager.fetchLimit)
    .all();

  // the stamp is nullable, but every branch filters on IS NOT NULL
  return pager.toPage(rows as unknown as StampedEntity<S>[]);
}

/** the stamped rows of one table, shaped as StampedEntity summaries */
function branch(
  db: BetterSQLite3Database,
  stamp: Stamp,
  type: StampedEntityType,
  after: SQL | undefined,
) {
  const table = STAMPED_TABLES[type];
  // the rows the list shows; matches the partial index of each table
  const shown =
    type === 'events'
      ? not(hasLinkInState('event', events.id, LinkState.REMOVED))
      : isNull((table as ArchivableTable).archivedAt);
  return db
    .select({
      // widened to StampedId because the union carries all four id types, and drizzle infers the
      // compound row's shape from the first select
      id: sql<StampedId>`${table.id}`.as('id'),
      entityType: sql<StampedEntityType>`${type}`,
      title: table.title,
      [stamp]: table[stamp],
    })
    .from(table)
    .where(and(isNotNull(table[stamp]), shown, after))
    .$dynamic();
}
