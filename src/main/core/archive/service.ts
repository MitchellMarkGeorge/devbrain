import { NoteId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, or, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { unionAll } from 'drizzle-orm/sqlite-core';
import { Task } from '../tasks/types';
import { Project } from '../projects/types';
import { projects } from '@main/db/schema/projects';
import { Note } from '../notes/types';
import { notes } from '@main/db/schema/notes';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../shared/errors';
import { keyset, Page, PageOptions } from '../shared/pagination';
import { assertEditable } from '../integrations/refs';
import type {
  ArchivableEntityType,
  ArchivableId,
  ArchivedEntity,
  ArchiveFilterOptions,
} from './types';

export class ArchiveService {
  constructor(private readonly db: BetterSQLite3Database) {}

  archiveTask(id: TaskId): Task {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt !== null) throw new AlreadyArchivedError(id);
      // a synced task is detached before it can be archived; restore is left open for SyncWriter
      assertEditable(tx, id);

      const now = new Date();
      // archives the task and any subtasks it has
      const updatedTasks = tx
        .update(tasks)
        .set({ archivedAt: now })
        .where(
          and(
            sql`(${tasks.id} = ${id} OR ${tasks.parentTaskId} = ${id})`,
            isNull(tasks.archivedAt),
          ),
        )
        .returning()
        .all();

      const updatedTaskIds = updatedTasks.map((t) => t.id);

      // archive notes linked to the task and/or any of its subtasks
      if (updatedTaskIds.length > 0) {
        tx.update(notes)
          .set({ archivedAt: now })
          .where(inArray(notes.linkedTaskId, updatedTaskIds))
          .run();
      }

      const [task] = updatedTasks.filter((t) => t.id === id);
      return task;
    });
  }

  restoreTask(id: TaskId): Task {
    // restores the task and any subtasks it has
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      const updatedTasks = tx
        .update(tasks)
        .set({ archivedAt: null })
        .where(sql`(${tasks.id} = ${id} OR ${tasks.parentTaskId} = ${id})`)
        .returning()
        .all();

      const updatedTaskIds = updatedTasks.map((t) => t.id);

      // restore notes linked to the task and/or any of its subtasks
      if (updatedTaskIds.length > 0) {
        tx.update(notes)
          .set({ archivedAt: null })
          .where(inArray(notes.linkedTaskId, updatedTaskIds))
          .run();
      }

      const [task] = updatedTasks.filter((t) => t.id === id);
      return task;
    });
  }

  archiveProject(id: ProjectId): Project {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt !== null) throw new AlreadyArchivedError(id);
      // a synced project leaves only through sync
      assertEditable(tx, id);

      const now = new Date();
      // archive the project
      const project = tx
        .update(projects)
        .set({
          archivedAt: now,
        })
        .where(eq(projects.id, id))
        .returning()
        .get();

      // archive all tasks (and subtasks) attached to the project
      const updatedTaskIds = tx
        .update(tasks)
        .set({ archivedAt: now })
        .where(eq(tasks.projectId, id))
        .returning({ id: tasks.id })
        .all()
        .map(({ id }) => id);

      // archaive all related notes (either direct project notes or notes linked to tasks in the project - like task notes)
      tx.update(notes)
        .set({ archivedAt: now })
        .where(or(eq(notes.projectId, id), inArray(notes.linkedTaskId, updatedTaskIds)))
        .run();

      return project;
    });
  }

  restoreProject(id: ProjectId): Project {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      // restore the project
      const project = tx
        .update(projects)
        .set({
          archivedAt: null,
        })
        .where(eq(projects.id, id))
        .returning()
        .get();

      // restore all archived tasks (and subtasks) attached to the project
      const updatedTaskIds = tx
        .update(tasks)
        .set({ archivedAt: null })
        .where(eq(tasks.projectId, id))
        .returning({ id: tasks.id })
        .all()
        .map(({ id }) => id);

      // restore all related notes (either direct project notes or notes linked to tasks in the project - like task notes)
      tx.update(notes)
        .set({ archivedAt: null })
        .where(or(eq(notes.projectId, id), inArray(notes.linkedTaskId, updatedTaskIds)))
        .run();

      return project;
    });
  }

  archiveNote(id: NoteId): Note {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(notes).where(eq(notes.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt !== null) throw new AlreadyArchivedError(id);

      const note = tx
        .update(notes)
        .set({ archivedAt: new Date() })
        .where(eq(notes.id, id))
        .returning()
        .get();
      return note;
    });
  }

  restoreNote(id: NoteId): Note {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(notes).where(eq(notes.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      const note = tx
        .update(notes)
        .set({ archivedAt: null })
        .where(eq(notes.id, id))
        .returning()
        .get();
      return note;
    });
  }

  /**
   * Every archived task, project and note as one list, most recently archived
   * first — the query behind the archive view. Paginated with an opaque cursor
   * like the other list methods, and optionally narrowed to one entity type.
   *
   * Cascades are *not* collapsed: archiving a project also stamps its tasks and
   * their notes, and each of those rows shows up here in its own right. The
   * caller decides whether to group them back under the entity that triggered
   * the archive.
   */
  listArchived(filter: ArchiveFilterOptions = {}, page: PageOptions = {}): Page<ArchivedEntity> {
    // one pager per table: the cursor condition is pushed into each branch of
    // the union (so each can seek its own (archived_at, id) index) rather than
    // applied to the union as a whole. ids carry a per-entity prefix, so they
    // are unique across the three tables and still a valid tiebreaker.
    //
    // past the first page, sqlite plans the keyset OR as a multi-index OR, so
    // each branch sorts every archived row past the cursor rather than seeking
    // in index order. Measured at ~0.4ms per 1k archived rows per page, which
    // is accepted at archive sizes; revisit if archives grow into the 10ks+.
    const entityType = filter.entityType ?? 'all';

    if (entityType !== 'all') {
      // a single table needs no union, so it can order by its own columns
      const table = ARCHIVABLE_TABLES[entityType];
      const pager = this.archivedPager(table, page);
      const rows = this.archivedBranch(entityType, pager.after)
        .orderBy(...pager.orderBy)
        .limit(pager.fetchLimit)
        .all();
      return pager.toPage(rows as ArchivedEntity[]);
    }

    const pager = this.archivedPager(tasks, page);
    const branch = (type: ArchivableEntityType) =>
      this.archivedBranch(type, this.archivedPager(ARCHIVABLE_TABLES[type], page).after);

    // a compound select resolves ORDER BY against the *result* column names of
    // its left-most branch, so these have to be the bare column names — a
    // table-qualified reference (and so pager.orderBy) is not valid here
    const rows = unionAll(branch('tasks'), branch('projects'), branch('notes'))
      .orderBy(sql`archived_at desc`, sql`id desc`)
      .limit(pager.fetchLimit)
      .all();

    // archivedAt is nullable on all three tables, but every branch filters on
    // IS NOT NULL, so no row here can carry a null
    return pager.toPage(rows as ArchivedEntity[]);
  }

  private archivedPager(table: ArchivableTable, page: PageOptions) {
    return keyset<ArchivedEntity>(
      {
        sortKey: 'archivedAt',
        sortColumn: table.archivedAt,
        idColumn: table.id,
        direction: 'desc',
        sortValue: (row) => row.archivedAt,
        id: (row) => row.id,
      },
      page,
    );
  }

  /** the archived rows of one table, shaped as ArchivedEntity summaries */
  private archivedBranch(type: ArchivableEntityType, after: SQL | undefined) {
    const table = ARCHIVABLE_TABLES[type];
    return this.db
      .select({
        // widened to ArchivableId because the union carries all three id types,
        // and drizzle infers the compound row's shape from the first select
        id: sql<ArchivableId>`${table.id}`.as('id'),
        entityType: sql<ArchivableEntityType>`${type}`,
        title: table.title,
        archivedAt: table.archivedAt,
      })
      .from(table)
      .where(and(isNotNull(table.archivedAt), after))
      .$dynamic();
  }
}

type ArchivableTable = typeof tasks | typeof projects | typeof notes;

const ARCHIVABLE_TABLES: Record<ArchivableEntityType, ArchivableTable> = {
  tasks,
  projects,
  notes,
};
