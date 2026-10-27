import { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import { events } from '@main/db/schema/events';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, isNotNull, isNull, not, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { BaseSQLiteDatabase, unionAll } from 'drizzle-orm/sqlite-core';
import { RunResult } from 'better-sqlite3';
import { Event } from '../events/types';
import { withEventDetails } from '../events/service';
import { hasLinkInState, withRef } from '../integrations/refs';
import { LinkState } from '../integrations/types';
import { Note } from '../notes/types';
import { Project } from '../projects/types';
import { Task } from '../tasks/types';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import { AlreadyFavoritedError, NotFavoritedError, NotFoundError } from '../shared/errors';
import { keyset, Page, PageOptions } from '../shared/pagination';
import type {
  FavoritableEntityType,
  FavoritableId,
  FavoritedEntity,
  FavoritesFilterOptions,
} from './types';

// What a favorite or unfavorite changed, for in-process subscribers such as the IPC layer forwarding
// it to the renderer. Sent after the write commits.
export type FavoriteChange =
  | { type: 'favorited'; entityType: FavoritableEntityType; id: FavoritableId; favoritedAt: Date }
  | { type: 'unfavorited'; entityType: FavoritableEntityType; id: FavoritableId };

/**
 * Favoriting stamps an entity's `favoritedAt`; unfavoriting clears it. Unlike an archive nothing
 * cascades: only the entity named is changed.
 *
 * `favoritedAt` belongs to DevBrain, never to a provider (SyncWriter leaves it alone), so a synced
 * task, project or event can be favorited like a local one. Favoriting leaves `updatedAt` as it
 * was: it is not an edit of the entity, and must not move it in the lists sorted by last update.
 *
 * An archived entity keeps its favorite, but is left out of listFavorites until it is restored.
 */
export class FavoritesService {
  private readonly changes = new ChangeListeners<FavoriteChange>('Favorites');

  constructor(private readonly db: BetterSQLite3Database) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<FavoriteChange>): () => void {
    return this.changes.add(listener);
  }

  favoriteTask(id: TaskId): Task {
    const task = this.db.transaction((tx) => withRef(tx, this.setFavorited(tx, tasks, id, true)));
    this.emitFavorited('tasks', task);
    return task;
  }

  unfavoriteTask(id: TaskId): Task {
    const task = this.db.transaction((tx) => withRef(tx, this.setFavorited(tx, tasks, id, false)));
    this.changes.emit({ type: 'unfavorited', entityType: 'tasks', id });
    return task;
  }

  favoriteProject(id: ProjectId): Project {
    const project = this.db.transaction((tx) =>
      withRef(tx, this.setFavorited(tx, projects, id, true)),
    );
    this.emitFavorited('projects', project);
    return project;
  }

  unfavoriteProject(id: ProjectId): Project {
    const project = this.db.transaction((tx) =>
      withRef(tx, this.setFavorited(tx, projects, id, false)),
    );
    this.changes.emit({ type: 'unfavorited', entityType: 'projects', id });
    return project;
  }

  favoriteNote(id: NoteId): Note {
    const note = this.setFavorited(this.db, notes, id, true);
    this.emitFavorited('notes', note);
    return note;
  }

  unfavoriteNote(id: NoteId): Note {
    const note = this.setFavorited(this.db, notes, id, false);
    this.changes.emit({ type: 'unfavorited', entityType: 'notes', id });
    return note;
  }

  favoriteEvent(id: EventId): Event {
    const event = this.db.transaction((tx) => {
      const row = this.setFavorited(tx, events, id, true);
      return withEventDetails(tx, [row])[0];
    });
    this.emitFavorited('events', event);
    return event;
  }

  unfavoriteEvent(id: EventId): Event {
    const event = this.db.transaction((tx) => {
      const row = this.setFavorited(tx, events, id, false);
      return withEventDetails(tx, [row])[0];
    });
    this.changes.emit({ type: 'unfavorited', entityType: 'events', id });
    return event;
  }

  /**
   * Every favorited task, project, note and event as one list, most recently favorited first: the
   * query behind the favorites view. Paginated with an opaque cursor like the other list methods,
   * and optionally narrowed to one entity type.
   *
   * Left out: archived tasks, projects and notes, and events whose provider item was cancelled or
   * deleted (link state `removed`), which are kept only for the notes linked to them.
   */
  listFavorites(
    filter: FavoritesFilterOptions = {},
    page: PageOptions = {},
  ): Page<FavoritedEntity> {
    // built like ArchiveService.listArchived: one pager per table, with the cursor condition pushed
    // into each branch of the union so each can seek its own (favorited_at, id) index. ids carry a
    // per-entity prefix, so they are unique across the tables and still a valid tiebreaker.
    const entityType = filter.entityType ?? 'all';

    if (entityType !== 'all') {
      // a single table needs no union, so it can order by its own columns
      const pager = this.favoritedPager(FAVORITABLE_TABLES[entityType], page);
      const rows = this.favoritedBranch(entityType, pager.after)
        .orderBy(...pager.orderBy)
        .limit(pager.fetchLimit)
        .all();
      return pager.toPage(rows as FavoritedEntity[]);
    }

    const pager = this.favoritedPager(tasks, page);
    const branch = (type: FavoritableEntityType) =>
      this.favoritedBranch(type, this.favoritedPager(FAVORITABLE_TABLES[type], page).after);

    // a compound select resolves ORDER BY against the *result* column names of its left-most
    // branch, so these have to be the bare column names, not pager.orderBy
    const rows = unionAll(branch('tasks'), branch('projects'), branch('notes'), branch('events'))
      .orderBy(sql`favorited_at desc`, sql`id desc`)
      .limit(pager.fetchLimit)
      .all();

    // favoritedAt is nullable, but every branch filters on IS NOT NULL
    return pager.toPage(rows as FavoritedEntity[]);
  }

  /**
   * Stamps or clears `favoritedAt` on one row and returns it as written. Throws NotFoundError when
   * there is no such row, and AlreadyFavoritedError or NotFavoritedError when it is already in the
   * state asked for. `db` can be a transaction.
   */
  private setFavorited<T extends FavoritableTable>(
    db: BaseSQLiteDatabase<'sync', RunResult>,
    table: T,
    id: FavoritableId,
    favorite: boolean,
  ): T['$inferSelect'] {
    // the tables are typed apart; for these shared columns they behave alike
    const t = table as typeof tasks;
    const existing = db
      .select({ favoritedAt: t.favoritedAt, updatedAt: t.updatedAt })
      .from(t)
      .where(eq(t.id, id as TaskId))
      .get();
    if (!existing) throw new NotFoundError(id);
    if (favorite && existing.favoritedAt !== null) throw new AlreadyFavoritedError(id);
    if (!favorite && existing.favoritedAt === null) throw new NotFavoritedError(id);

    return (
      db
        .update(t)
        // updatedAt is set to what it was, or its $onUpdate would stamp it with now
        .set({ favoritedAt: favorite ? new Date() : null, updatedAt: existing.updatedAt })
        .where(eq(t.id, id as TaskId))
        .returning()
        .get() as T['$inferSelect']
    );
  }

  private emitFavorited(
    entityType: FavoritableEntityType,
    row: { id: FavoritableId; favoritedAt: Date | null },
  ): void {
    this.changes.emit({ type: 'favorited', entityType, id: row.id, favoritedAt: row.favoritedAt! });
  }

  private favoritedPager(table: FavoritableTable, page: PageOptions) {
    return keyset<FavoritedEntity>(
      {
        sortKey: 'favoritedAt',
        sortColumn: table.favoritedAt,
        idColumn: table.id,
        direction: 'desc',
        sortValue: (row) => row.favoritedAt,
        id: (row) => row.id,
      },
      page,
    );
  }

  /** the favorited rows of one table, shaped as FavoritedEntity summaries */
  private favoritedBranch(type: FavoritableEntityType, after: SQL | undefined) {
    const table = FAVORITABLE_TABLES[type];
    // the favorited rows the list shows; matches the partial index of each table
    const shown =
      type === 'events'
        ? not(hasLinkInState('event', events.id, LinkState.REMOVED))
        : isNull((table as ArchivableTable).archivedAt);
    return this.db
      .select({
        // widened to FavoritableId because the union carries all four id types, and drizzle infers
        // the compound row's shape from the first select
        id: sql<FavoritableId>`${table.id}`.as('id'),
        entityType: sql<FavoritableEntityType>`${type}`,
        title: table.title,
        favoritedAt: table.favoritedAt,
      })
      .from(table)
      .where(and(isNotNull(table.favoritedAt), shown, after))
      .$dynamic();
  }
}

type ArchivableTable = typeof tasks | typeof projects | typeof notes;
type FavoritableTable = ArchivableTable | typeof events;

const FAVORITABLE_TABLES: Record<FavoritableEntityType, FavoritableTable> = {
  tasks,
  projects,
  notes,
  events,
};
