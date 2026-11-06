import { NoteId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, not, or, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { unionAll } from 'drizzle-orm/sqlite-core';
import {
  type ArchivableEntityType,
  type ArchivableId,
  type ArchivedEntity,
  type EmptyTrashResult,
  LinkState,
  Note,
  Page,
  Project,
  Task,
} from '@common/types';
import { projects } from '@main/db/schema/projects';
import { notes } from '@main/db/schema/notes';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../shared/errors';
import { keyset, PageOptions } from '../shared/pagination';
import {
  assertEditable,
  hasLinkInState,
  withExternalRef,
  withExternalRefs,
} from '../integrations/refs';
import { subtreeOf, subtreeOfAll } from '../tasks/subtree';
import { ChangeListener, ChangeListeners } from '../shared/changes';
import type { NoteService } from '../notes/service';
import type { ArchiveFilterOptions } from './types';

// The rows an archive or restore stamped: the entity itself and everything it cascaded to.
export interface ArchiveChangedIds {
  taskIds: TaskId[];
  projectIds: ProjectId[];
  noteIds: NoteId[];
}

// What an archive or restore changed, for in-process subscribers: the workspace keeps search in
// step, and the IPC layer will forward them to the renderer. Sent as the last step of the write,
// inside its transaction, like IntegrationService's `disconnected`: a listener's synchronous
// database writes (search dropping or re-indexing the rows) commit with it, and anything
// asynchronous runs after the commit.
//
// `emptied` names every row emptyTrash deleted for good, and the rows left that lost a link to one
// of them: tasks and notes whose project went, notes whose task went, tasks whose note went (made
// from it, or the task it was the task note of).
export type ArchiveChange =
  | ({ type: 'archived' } & ArchiveChangedIds)
  | ({ type: 'restored' } & ArchiveChangedIds)
  | ({ type: 'emptied'; unlinkedTaskIds: TaskId[]; unlinkedNoteIds: NoteId[] } & ArchiveChangedIds);

// the transaction emptyTrash runs its steps in
type Transaction = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0];

// What removes the deleted notes' files once emptyTrash commits: the NoteService, which owns the
// notes folder and each note's queue of content saves
export type NoteFiles = Pick<NoteService, 'removeDeletedFiles'>;

export class ArchiveService {
  private readonly changes = new ChangeListeners<ArchiveChange>('Archive');

  constructor(
    private readonly db: BetterSQLite3Database,
    // needed by emptyTrash only
    private readonly noteFiles?: NoteFiles,
  ) {}

  // returns a function that unsubscribes the listener
  onChange(listener: ChangeListener<ArchiveChange>): () => void {
    return this.changes.add(listener);
  }

  archiveTask(id: TaskId): Task {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt !== null) throw new AlreadyArchivedError(id);
      // a synced task is detached before it can be archived; restore is left open for SyncWriter
      assertEditable(tx, id);

      const now = new Date();
      // archives the task and its whole subtree: a local task's subtasks, or the deeper subtree a
      // detached task carried over from Linear
      const updatedTasks = tx
        .update(tasks)
        .set({ archivedAt: now })
        .where(and(inArray(tasks.id, subtreeOf(id)), isNull(tasks.archivedAt)))
        .returning()
        .all();

      const updatedTaskIds = updatedTasks.map((t) => t.id);

      // archive notes linked to the task and/or any of its subtasks
      const noteIds =
        updatedTaskIds.length > 0
          ? tx
              .update(notes)
              .set({ archivedAt: now })
              .where(inArray(notes.linkedTaskId, updatedTaskIds))
              .returning({ id: notes.id })
              .all()
              .map(({ id }) => id)
          : [];

      this.changes.emit({ type: 'archived', taskIds: updatedTaskIds, projectIds: [], noteIds });
      const [task] = updatedTasks.filter((t) => t.id === id);
      return withExternalRef(tx, task);
    });
  }

  /**
   * Archives every task in `ids`, each with its subtree and linked notes as archiveTask does, in one
   * transaction: all are archived, or none is. Every id is checked first, and one refusal fails the
   * batch: NotFoundError for an unknown id, AlreadyArchivedError for one already in the trash, and
   * ExternalReadOnlyError for a synced task, which leaves only through sync (detach it first).
   * A task whose ancestor is also in `ids` goes with that ancestor's subtree. One `archived` change
   * is sent, with every row stamped, as the transaction's last step. Returns the tasks of `ids`
   * as archived, in that order; a repeated id counts once.
   */
  archiveTasks(ids: TaskId[]): Task[] {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    return this.db.transaction((tx) => {
      const existing = new Map(
        tx
          .select({ id: tasks.id, archivedAt: tasks.archivedAt })
          .from(tasks)
          .where(inArray(tasks.id, uniqueIds))
          .all()
          .map((row) => [row.id, row]),
      );
      for (const id of uniqueIds) {
        const row = existing.get(id);
        if (!row) throw new NotFoundError(id);
        if (row.archivedAt !== null) throw new AlreadyArchivedError(id);
        assertEditable(tx, id);
      }

      const now = new Date();
      const updatedTasks = tx
        .update(tasks)
        .set({ archivedAt: now })
        .where(and(inArray(tasks.id, subtreeOfAll(uniqueIds)), isNull(tasks.archivedAt)))
        .returning()
        .all();
      const updatedTaskIds = updatedTasks.map((t) => t.id);

      const noteIds = tx
        .update(notes)
        .set({ archivedAt: now })
        .where(inArray(notes.linkedTaskId, updatedTaskIds))
        .returning({ id: notes.id })
        .all()
        .map(({ id }) => id);

      this.changes.emit({ type: 'archived', taskIds: updatedTaskIds, projectIds: [], noteIds });
      const byId = new Map(updatedTasks.map((task) => [task.id, task]));
      return withExternalRefs(
        tx,
        uniqueIds.map((id) => byId.get(id)!),
      );
    });
  }

  restoreTask(id: TaskId): Task {
    // restores the task and its whole subtree, as archiveTask archived it
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      const updatedTasks = tx
        .update(tasks)
        .set({ archivedAt: null })
        .where(inArray(tasks.id, subtreeOf(id)))
        .returning()
        .all();

      const updatedTaskIds = updatedTasks.map((t) => t.id);

      // restore notes linked to the task and/or any of its subtasks
      const noteIds =
        updatedTaskIds.length > 0
          ? tx
              .update(notes)
              .set({ archivedAt: null })
              .where(inArray(notes.linkedTaskId, updatedTaskIds))
              .returning({ id: notes.id })
              .all()
              .map(({ id }) => id)
          : [];

      this.changes.emit({ type: 'restored', taskIds: updatedTaskIds, projectIds: [], noteIds });
      const [task] = updatedTasks.filter((t) => t.id === id);
      return withExternalRef(tx, task);
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
      const noteIds = tx
        .update(notes)
        .set({ archivedAt: now })
        .where(or(eq(notes.projectId, id), inArray(notes.linkedTaskId, updatedTaskIds)))
        .returning({ id: notes.id })
        .all()
        .map(({ id }) => id);

      this.changes.emit({ type: 'archived', taskIds: updatedTaskIds, projectIds: [id], noteIds });
      return withExternalRef(tx, project);
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
      const noteIds = tx
        .update(notes)
        .set({ archivedAt: null })
        .where(or(eq(notes.projectId, id), inArray(notes.linkedTaskId, updatedTaskIds)))
        .returning({ id: notes.id })
        .all()
        .map(({ id }) => id);

      this.changes.emit({ type: 'restored', taskIds: updatedTaskIds, projectIds: [id], noteIds });
      return withExternalRef(tx, project);
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
      this.changes.emit({ type: 'archived', taskIds: [], projectIds: [], noteIds: [id] });
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
      this.changes.emit({ type: 'restored', taskIds: [], projectIds: [], noteIds: [id] });
      return note;
    });
  }

  /**
   * Empties the trash: deletes every archived task, project and note for good, in one
   * transaction, and sends one `emptied` change as its last step, inside it, so search drops the
   * rows in the same commit. Then it removes the deleted notes' files.
   *
   * What goes and what stays follows the one-item deletes (docs/deleting.md): foreign keys take a
   * task's subtasks and links along, and clear the project or link of the tasks and notes left.
   * An archived task with an active or synced task anywhere below it is kept (`keptTaskIds`), as
   * TaskService.deleteTask refuses it: sync can archive a removed Linear task and leave its
   * synced subtasks live. A synced project is never archived; one would be kept too.
   *
   * The files go after the commit, each behind its note's queued content saves. One that can't
   * be removed is logged and listed in `filesNotRemoved`; the rest still go, and nothing is
   * undone, as with NoteService.deleteNote.
   */
  async emptyTrash(): Promise<EmptyTrashResult> {
    const noteFiles = this.noteFiles;
    if (!noteFiles) throw new Error('emptyTrash needs the note files: pass a NoteService');
    const { keptTaskIds, ...deleted } = this.db.transaction((tx) => {
      // tasks first, so the later steps' unlinked rows are only tasks that are left
      const removedTasks = this.deleteArchivedTasks(tx);
      const removedProjects = this.deleteArchivedProjects(tx);
      const removedNotes = this.deleteArchivedNotes(tx);
      const change = {
        taskIds: removedTasks.ids,
        projectIds: removedProjects.ids,
        noteIds: removedNotes.ids,
        unlinkedTaskIds: [
          ...new Set([...removedProjects.unlinkedTaskIds, ...removedNotes.unlinkedTaskIds]),
        ],
        unlinkedNoteIds: [
          ...new Set([...removedTasks.unlinkedNoteIds, ...removedProjects.unlinkedNoteIds]),
        ],
      };
      if (change.taskIds.length + change.projectIds.length + change.noteIds.length > 0) {
        this.changes.emit({ type: 'emptied', ...change });
      }
      const { taskIds, projectIds, noteIds } = change;
      return { taskIds, projectIds, noteIds, keptTaskIds: removedTasks.keptIds };
    });
    const filesNotRemoved = await noteFiles.removeDeletedFiles(deleted.noteIds);
    return { ...deleted, keptTaskIds, filesNotRemoved };
  }

  // emptyTrash's tasks: every archived task with nothing below it that must stay, and its subtree
  // with it. Returns them, the archived tasks kept, and the active notes that lose their task
  // (archived ones go with the notes).
  private deleteArchivedTasks(tx: Transaction): {
    ids: TaskId[];
    keptIds: TaskId[];
    unlinkedNoteIds: NoteId[];
  } {
    // Every task that must stay (active or synced), and every ancestor of one, since deleting a
    // task takes its subtree along
    const synced = hasLinkInState('task', tasks.id, LinkState.SYNCED);
    const mustStay = sql`(with recursive kept(id) as (select ${tasks.id} from ${tasks} where ${tasks.archivedAt} is null or ${synced} union select ${tasks.parentTaskId} from ${tasks} join kept on ${tasks.id} = kept.id where ${tasks.parentTaskId} is not null) select id from kept)`;
    const archived = tx
      .select({ id: tasks.id, kept: sql<number>`${tasks.id} in ${mustStay}` })
      .from(tasks)
      .where(isNotNull(tasks.archivedAt))
      .all();
    const ids = archived.filter((row) => !row.kept).map((row) => row.id);
    const keptIds = archived.filter((row) => row.kept).map((row) => row.id);
    if (ids.length === 0) return { ids, keptIds, unlinkedNoteIds: [] };

    // read before the delete clears their link
    const unlinkedNoteIds = tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(inArray(notes.linkedTaskId, ids), isNull(notes.archivedAt)))
      .all()
      .map((row) => row.id);
    tx.delete(tasks).where(inArray(tasks.id, ids)).run();
    return { ids, keptIds, unlinkedNoteIds };
  }

  // emptyTrash's projects: every archived one (a synced project is never archived; one would be
  // kept). Returns them, and the tasks left and active notes that lose their project.
  private deleteArchivedProjects(tx: Transaction): {
    ids: ProjectId[];
    unlinkedTaskIds: TaskId[];
    unlinkedNoteIds: NoteId[];
  } {
    const ids = tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          isNotNull(projects.archivedAt),
          not(hasLinkInState('project', projects.id, LinkState.SYNCED)),
        ),
      )
      .all()
      .map((row) => row.id);
    if (ids.length === 0) return { ids, unlinkedTaskIds: [], unlinkedNoteIds: [] };

    // read before the delete clears their project
    const unlinkedTaskIds = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.projectId, ids))
      .all()
      .map((row) => row.id);
    const unlinkedNoteIds = tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(inArray(notes.projectId, ids), isNull(notes.archivedAt)))
      .all()
      .map((row) => row.id);
    tx.delete(projects).where(inArray(projects.id, ids)).run();
    return { ids, unlinkedTaskIds, unlinkedNoteIds };
  }

  // emptyTrash's notes: every archived one; the files are removed after the commit. Returns them,
  // and the tasks left that lose a note: made from one, or the task one was the task note of.
  private deleteArchivedNotes(tx: Transaction): { ids: NoteId[]; unlinkedTaskIds: TaskId[] } {
    const archived = tx
      .select({ id: notes.id, linkedTaskId: notes.linkedTaskId })
      .from(notes)
      .where(isNotNull(notes.archivedAt))
      .all();
    const ids = archived.map((row) => row.id);
    if (ids.length === 0) return { ids, unlinkedTaskIds: [] };

    // read before the delete clears their link
    const madeFromThem = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.linkedNoteId, ids))
      .all()
      .map((row) => row.id);
    // a deleted task's notes lost their link with it, so these are tasks that are left
    const theirTasks = archived.flatMap((row) => row.linkedTaskId ?? []);
    tx.delete(notes).where(inArray(notes.id, ids)).run();
    return { ids, unlinkedTaskIds: [...new Set([...madeFromThem, ...theirTasks])] };
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
