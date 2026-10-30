import { EventId, isId, NoteId, ProjectId, TaskId } from '@common/ids';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, inArray, isNotNull, isNull, not, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { unionAll } from 'drizzle-orm/sqlite-core';
import { withEventDetails } from '../events/service';
import type { Event } from '../events/types';
import { hasLinkInState, withRefs } from '../integrations/refs';
import { LinkState } from '../integrations/types';
import type { Note } from '../notes/types';
import type { Project } from '../projects/types';
import type { Task } from '../tasks/types';
import { keyset, Page, PageOptions } from './pagination';

// Lists of tasks, projects, notes and events ordered by a timestamp DevBrain stamps on them:
// favorites by `favoritedAt`, recents by `viewedAt`.

export type StampedEntityType = 'tasks' | 'projects' | 'notes' | 'events';

export type StampedId = TaskId | ProjectId | NoteId | EventId;

/** the timestamp columns a list can be ordered by, with their SQL names */
const STAMP_COLUMNS = { favoritedAt: 'favorited_at', viewedAt: 'viewed_at' } as const;

export type Stamp = keyof typeof STAMP_COLUMNS;

/**
 * A row in a stamped list: the whole entity, read as its own service reads it, so a view can show
 * what it shows elsewhere (a task's status, a project's colour, an event's colour), with the stamp.
 * Narrow on `entityType` to get the entity's type.
 */
export type StampedEntity<S extends Stamp> = (
  | { entityType: 'tasks'; entity: Task }
  | { entityType: 'projects'; entity: Project }
  | { entityType: 'notes'; entity: Note }
  | { entityType: 'events'; entity: Event }
) &
  Record<S, Date>;

/** what the list query returns for a row: which entity it is, and its stamp */
export type StampedRow<S extends Stamp> = {
  id: StampedId;
  entityType: StampedEntityType;
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
 * One query picks the page, then each entity type on it is read in one batched lookup (see
 * withEntities), so the number of queries does not grow with the page.
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
    keyset<StampedRow<S>>(
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
    return pageWithEntities(db, stamp, pager.toPage(rows as StampedRow<S>[]));
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
  return pageWithEntities(db, stamp, pager.toPage(rows as unknown as StampedRow<S>[]));
}

function pageWithEntities<S extends Stamp>(
  db: BetterSQLite3Database,
  stamp: S,
  page: Page<StampedRow<S>>,
): Page<StampedEntity<S>> {
  return { items: withEntities(db, stamp, page.items), nextCursor: page.nextCursor };
}

/**
 * The entities behind `rows`, in their order, each with its stamp. Each entity type is read in one
 * `IN` query, and its details (a synced row's `external`, a series' `exdates`) in the batched
 * lookups its service uses, so a page costs the same few queries whatever its length.
 *
 * Read in the same synchronous call that wrote or listed the rows, so every one is still there.
 */
export function withEntities<S extends Stamp>(
  db: BetterSQLite3Database,
  stamp: S,
  rows: StampedRow<S>[],
): StampedEntity<S>[] {
  const idsOf = <T extends StampedId>(type: StampedEntityType) =>
    rows.filter((row) => row.entityType === type).map((row) => row.id as T);
  const entries = new Map<StampedId, StampedEntity<never>>();

  const taskIds = idsOf<TaskId>('tasks');
  if (taskIds.length > 0) {
    const rows = db.select().from(tasks).where(inArray(tasks.id, taskIds)).all();
    for (const entity of withRefs(db, rows)) {
      entries.set(entity.id, { entityType: 'tasks', entity });
    }
  }
  const projectIds = idsOf<ProjectId>('projects');
  if (projectIds.length > 0) {
    const rows = db.select().from(projects).where(inArray(projects.id, projectIds)).all();
    for (const entity of withRefs(db, rows)) {
      entries.set(entity.id, { entityType: 'projects', entity });
    }
  }
  const noteIds = idsOf<NoteId>('notes');
  if (noteIds.length > 0) {
    for (const entity of db.select().from(notes).where(inArray(notes.id, noteIds)).all()) {
      entries.set(entity.id, { entityType: 'notes', entity });
    }
  }
  const eventIds = idsOf<EventId>('events');
  if (eventIds.length > 0) {
    const rows = db.select().from(events).where(inArray(events.id, eventIds)).all();
    for (const entity of withEventDetails(db, rows)) {
      entries.set(entity.id, { entityType: 'events', entity });
    }
  }

  return rows.map((row) => ({ ...entries.get(row.id)!, [stamp]: row[stamp] }) as StampedEntity<S>);
}

/** the stamped rows of one table: each one's id, entity type and stamp */
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
      [stamp]: table[stamp],
    })
    .from(table)
    .where(and(isNotNull(table[stamp]), shown, after))
    .$dynamic();
}
