import { NoteId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNotNull, isNull, not, or, SQL, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { unionAll } from 'drizzle-orm/sqlite-core';
import {
  type ArchivableEntityType,
  type ArchivableId,
  type ArchivedEntity,
  type ArchivePreview,
  type EmptyTrashResult,
  type RestoreResult,
  type TrashSelection,
  LinkState,
  Note,
  Page,
  Project,
  Task,
} from '@common/types';
import { projects } from '@main/db/schema/projects';
import { externalLinks } from '@main/db/schema/integrations';
import { notes } from '@main/db/schema/notes';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../shared/errors';
import { keyset, PageOptions } from '../shared/pagination';
import {
  assertEditable,
  getRefs,
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
// `emptied` names every row deleted for good from the trash (all of it by emptyTrash, or a
// selection by deleteMany), and the rows left that lost a link to one of them: tasks and notes whose project went, notes whose task went, tasks whose note went (made
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

      // the task, its whole subtree (a local task's subtasks, or the deeper subtree a detached
      // task carried over from Linear), and the notes linked to any of them
      const archived = applyArchivePlan(tx, planArchive(tx, { taskIds: [id], projectIds: [] }));
      this.changes.emit({ type: 'archived', projectIds: [], ...archived.ids });
      const [task] = archived.tasks.filter((t) => t.id === id);
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

      const archived = applyArchivePlan(
        tx,
        planArchive(tx, { taskIds: uniqueIds, projectIds: [] }),
      );
      this.changes.emit({ type: 'archived', projectIds: [], ...archived.ids });
      const byId = new Map(archived.tasks.map((task) => [task.id, task]));
      return withExternalRefs(
        tx,
        uniqueIds.map((id) => byId.get(id)!),
      );
    });
  }

  /**
   * Restores the task and what went to the trash with it (`restoreTaskTrashedWith`): the part of
   * its subtree, and the task notes, stamped with its own `archivedAt`. A subtask trashed on its own
   * before, by the user or by sync (Linear archiving a sub-issue), stays in the trash. A restored
   * row its provider removed (its link `removed`) comes back detached (`detachRemovedLinks`).
   */
  restoreTask(id: TaskId): Task {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt === null) throw new NotArchivedError(id);

      const { taskIds: updatedTaskIds, noteIds } = restoreTaskTrashedWith(
        tx,
        id,
        existing.archivedAt,
      );
      detachRemovedLinks(tx, updatedTaskIds, []);

      this.changes.emit({ type: 'restored', taskIds: updatedTaskIds, projectIds: [], noteIds });
      const task = tx.select().from(tasks).where(eq(tasks.id, id)).get()!;
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
      const project = tx
        .update(projects)
        .set({ archivedAt: now })
        .where(eq(projects.id, id))
        .returning()
        .get();
      // its tasks (and subtasks), and its notes and those linked to its tasks (task notes)
      const archived = applyArchivePlan(
        tx,
        planArchive(tx, { taskIds: [], projectIds: [id] }),
        now,
      );
      this.changes.emit({ type: 'archived', projectIds: [id], ...archived.ids });
      return withExternalRef(tx, project);
    });
  }

  /**
   * Restores the project and what went to the trash with it (`restoreProjectTrashedWith`): its tasks,
   * their task notes and its notes, as archiveProject stamped them. A task or note of the project
   * trashed on its own before stays in the trash. A restored row its provider removed comes back
   * detached (`detachRemovedLinks`).
   */
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

      // what went to the trash with it, and nothing trashed on its own before
      const { taskIds: updatedTaskIds, noteIds } = restoreProjectTrashedWith(
        tx,
        id,
        existing.archivedAt,
      );
      detachRemovedLinks(tx, updatedTaskIds, [id]);

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
   * What archiving `selection` (archiveTask/archiveTasks, archiveProject and archiveNote together)
   * would take along besides the rows chosen: each chosen task's subtree, each chosen project's
   * tasks, and the notes linked to any of those tasks or to a chosen project. Rows already in the
   * trash, and the rows chosen, are left out. Reads only; unknown ids add nothing.
   */
  previewArchive(selection: TrashSelection): ArchivePreview {
    const chosen = new Set<string>([
      ...selection.taskIds,
      ...selection.projectIds,
      ...selection.noteIds,
    ]);
    // one read, so the rows come from the same snapshot
    const plan = this.db.transaction((tx) => planArchive(tx, selection));
    return {
      tasks: plan.tasks.filter((task) => !chosen.has(task.id)),
      notes: plan.notes.filter((note) => !chosen.has(note.id)),
    };
  }

  /**
   * Restores the rows chosen in Trash, each as its own restore does, in one transaction: all are
   * restored, or none is. Every id is checked first, and one refusal fails the batch:
   * NotFoundError for an unknown id, NotArchivedError for one not in the trash.
   *
   * Projects go first, each bringing back what went to the trash with it (restoreProject); then the
   * tasks chosen, each likewise (restoreTask); then the notes chosen. A
   * row an earlier step already brought back (a task of a project also chosen) is restored once,
   * not refused. One `restored` change, with every row restored, is sent as the transaction's last
   * step. A repeated id counts once.
   */
  restoreMany(selection: TrashSelection): RestoreResult {
    const taskIds = [...new Set(selection.taskIds)];
    const projectIds = [...new Set(selection.projectIds)];
    const noteIds = [...new Set(selection.noteIds)];
    if (taskIds.length + projectIds.length + noteIds.length === 0) {
      return { taskIds: [], projectIds: [], noteIds: [] };
    }
    return this.db.transaction((tx) => {
      assertInTrash(tx, tasks, taskIds);
      assertInTrash(tx, projects, projectIds);
      assertInTrash(tx, notes, noteIds);

      // each project with what went to the trash with it, read by the time it was trashed
      const projectTaskIds: TaskId[] = [];
      const projectNoteIds: NoteId[] = [];
      if (projectIds.length > 0) {
        const trashed = tx
          .select({ id: projects.id, archivedAt: projects.archivedAt })
          .from(projects)
          .where(inArray(projects.id, projectIds))
          .all();
        tx.update(projects).set({ archivedAt: null }).where(inArray(projects.id, projectIds)).run();
        for (const project of trashed) {
          const restored = restoreProjectTrashedWith(tx, project.id, project.archivedAt!);
          projectTaskIds.push(...restored.taskIds);
          projectNoteIds.push(...restored.noteIds);
        }
      }
      // each task chosen with what went to the trash with it, unless an earlier step (its project,
      // or a parent chosen too) already brought it back
      const subtreeTaskIds: TaskId[] = [];
      const subtreeNoteIds: NoteId[] = [];
      for (const taskId of taskIds) {
        const { archivedAt } = tx
          .select({ archivedAt: tasks.archivedAt })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .get()!;
        if (archivedAt === null) continue;
        const restored = restoreTaskTrashedWith(tx, taskId, archivedAt);
        subtreeTaskIds.push(...restored.taskIds);
        subtreeNoteIds.push(...restored.noteIds);
      }
      const restoredTaskIds = [...projectTaskIds, ...subtreeTaskIds];
      detachRemovedLinks(tx, restoredTaskIds, projectIds);

      // the notes chosen; the projects' and tasks' came back with them above
      const chosenNoteIds =
        noteIds.length === 0
          ? []
          : tx
              .update(notes)
              .set({ archivedAt: null })
              .where(and(inArray(notes.id, noteIds), isNotNull(notes.archivedAt)))
              .returning({ id: notes.id })
              .all()
              .map(({ id }) => id);

      const restoredNoteIds = [
        ...new Set([...projectNoteIds, ...subtreeNoteIds, ...chosenNoteIds]),
      ];
      const restored = { taskIds: restoredTaskIds, projectIds, noteIds: restoredNoteIds };
      this.changes.emit({ type: 'restored', ...restored });
      return restored;
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
   * TaskService.deleteTask refuses it, a guard: sync makes a removed task's sub-issues that stay
   * top-level (SyncWriter's removeTasks), so it leaves none live under it. A synced project is
   * never archived; one would be kept too.
   *
   * The files go after the commit, each behind its note's queued content saves. One that can't
   * be removed is logged and listed in `filesNotRemoved`; the rest still go, and nothing is
   * undone, as with NoteService.deleteNote.
   */
  async emptyTrash(): Promise<EmptyTrashResult> {
    return this.deleteFromTrash('emptyTrash');
  }

  /**
   * Deletes the rows chosen in Trash for good, as emptyTrash deletes the whole trash, in one
   * transaction: the same rules, steps, `emptied` change and response, limited to `selection`.
   * Every id is checked first, and one refusal fails the batch and deletes nothing: NotFoundError
   * for an unknown id, NotArchivedError for one not in the trash. A task takes its subtree along
   * (a subtask also chosen goes with it), and one with an active or synced task below it stays
   * (`keptTaskIds`). A repeated id counts once.
   */
  async deleteMany(selection: TrashSelection): Promise<EmptyTrashResult> {
    const only = {
      taskIds: [...new Set(selection.taskIds)],
      projectIds: [...new Set(selection.projectIds)],
      noteIds: [...new Set(selection.noteIds)],
    };
    return this.deleteFromTrash('deleteMany', only);
  }

  // emptyTrash and deleteMany: the whole trash, or only the rows of `only`
  private async deleteFromTrash(caller: string, only?: TrashSelection): Promise<EmptyTrashResult> {
    const noteFiles = this.noteFiles;
    if (!noteFiles) throw new Error(`${caller} needs the note files: pass a NoteService`);
    const { keptTaskIds, ...deleted } = this.db.transaction((tx) => {
      if (only) {
        assertInTrash(tx, tasks, only.taskIds);
        assertInTrash(tx, projects, only.projectIds);
        assertInTrash(tx, notes, only.noteIds);
      }
      // tasks first, so the later steps' unlinked rows are only tasks that are left
      const removedTasks = this.deleteArchivedTasks(tx, only?.taskIds);
      const removedProjects = this.deleteArchivedProjects(tx, only?.projectIds);
      const removedNotes = this.deleteArchivedNotes(tx, only?.noteIds);
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

  // The trash's tasks (or those of `only`): each archived task with nothing below it that must
  // stay, and its subtree with it. Returns every task removed, the archived tasks kept, and the
  // active notes that lose their task (archived ones go with the notes).
  private deleteArchivedTasks(
    tx: Transaction,
    only?: TaskId[],
  ): {
    ids: TaskId[];
    keptIds: TaskId[];
    unlinkedNoteIds: NoteId[];
  } {
    if (only?.length === 0) return { ids: [], keptIds: [], unlinkedNoteIds: [] };
    // Every task that must stay (active or synced), and every ancestor of one, since deleting a
    // task takes its subtree along
    const synced = hasLinkInState('task', tasks.id, LinkState.SYNCED);
    const mustStay = sql`(with recursive kept(id) as (select ${tasks.id} from ${tasks} where ${tasks.archivedAt} is null or ${synced} union select ${tasks.parentTaskId} from ${tasks} join kept on ${tasks.id} = kept.id where ${tasks.parentTaskId} is not null) select id from kept)`;
    const archived = tx
      .select({ id: tasks.id, kept: sql<number>`${tasks.id} in ${mustStay}` })
      .from(tasks)
      .where(and(isNotNull(tasks.archivedAt), only && inArray(tasks.id, only)))
      .all();
    const chosen = archived.filter((row) => !row.kept).map((row) => row.id);
    const keptIds = archived.filter((row) => row.kept).map((row) => row.id);
    if (chosen.length === 0) return { ids: [], keptIds, unlinkedNoteIds: [] };
    // with each its subtree, which is all archived and none synced, or the task would be kept (on
    // emptying the whole trash, that is every task already chosen)
    const ids = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, subtreeOfAll(chosen)))
      .all()
      .map((row) => row.id);

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

  // The trash's projects (or those of `only`): every archived one (a synced project is never
  // archived; one would be kept). Returns them, and the tasks left and active notes that lose their
  // project.
  private deleteArchivedProjects(
    tx: Transaction,
    only?: ProjectId[],
  ): {
    ids: ProjectId[];
    unlinkedTaskIds: TaskId[];
    unlinkedNoteIds: NoteId[];
  } {
    if (only?.length === 0) return { ids: [], unlinkedTaskIds: [], unlinkedNoteIds: [] };
    const ids = tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          isNotNull(projects.archivedAt),
          not(hasLinkInState('project', projects.id, LinkState.SYNCED)),
          only && inArray(projects.id, only),
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

  // The trash's notes (or those of `only`): every archived one; the files are removed after the
  // commit. Returns them, and the tasks left that lose a note: made from one, or the task one was
  // the task note of.
  private deleteArchivedNotes(
    tx: Transaction,
    only?: NoteId[],
  ): { ids: NoteId[]; unlinkedTaskIds: TaskId[] } {
    if (only?.length === 0) return { ids: [], unlinkedTaskIds: [] };
    const archived = tx
      .select({ id: notes.id, linkedTaskId: notes.linkedTaskId })
      .from(notes)
      .where(and(isNotNull(notes.archivedAt), only && inArray(notes.id, only)))
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
      return this.withDetails(pager.toPage(rows as ArchivedRow[]));
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
    return this.withDetails(pager.toPage(rows as ArchivedRow[]));
  }

  /**
   * The page's rows with what each kind draws: one query per kind on the page (a join to the
   * project for tasks and notes), and one batched lookup of the links per linked kind, so a page
   * costs the same few queries however many rows it has. Paging stays on the union's own columns,
   * so its keyset is untouched.
   *
   * A row's project is shown even when it is in the trash too: archiving a project takes its tasks
   * and notes along, and the pill says where they came from. Lists elsewhere leave archived
   * projects out (shared/summaries).
   */
  private withDetails({ items, nextCursor }: Page<ArchivedRow>): Page<ArchivedEntity> {
    const idsOf = <Id extends ArchivableId>(type: ArchivableEntityType) =>
      items.filter((row) => row.entityType === type).map((row) => row.id as Id);
    const taskIds = idsOf<TaskId>('tasks');
    const projectIds = idsOf<ProjectId>('projects');
    const noteIds = idsOf<NoteId>('notes');

    // left-joined, so null for a row with no project
    const project = { id: projects.id, title: projects.title, color: projects.color };

    const taskDetails = new Map(
      (taskIds.length === 0
        ? []
        : this.db
            .select({ id: tasks.id, status: tasks.status, project })
            .from(tasks)
            .leftJoin(projects, eq(tasks.projectId, projects.id))
            .where(inArray(tasks.id, taskIds))
            .all()
      ).map((row) => [row.id, { status: row.status, project: row.project }]),
    );
    const taskRefs = getRefs(this.db, taskIds);

    const projectDetails = new Map(
      (projectIds.length === 0
        ? []
        : this.db
            .select({ id: projects.id, status: projects.status, color: projects.color })
            .from(projects)
            .where(inArray(projects.id, projectIds))
            .all()
      ).map((row) => [row.id, row]),
    );
    const projectRefs = getRefs(this.db, projectIds);

    const noteDetails = new Map(
      (noteIds.length === 0
        ? []
        : this.db
            .select({ id: notes.id, preview: notes.preview, project })
            .from(notes)
            .leftJoin(projects, eq(notes.projectId, projects.id))
            .where(inArray(notes.id, noteIds))
            .all()
      ).map((row) => [row.id, { preview: row.preview, project: row.project }]),
    );

    // every id came from the page's own query, in the same synchronous call, so each has its row
    const entities = items.map((row): ArchivedEntity => {
      switch (row.entityType) {
        case 'tasks': {
          const id = row.id as TaskId;
          const details = taskDetails.get(id)!;
          return {
            ...row,
            id,
            entityType: 'tasks',
            ...details,
            external: taskRefs.get(id) ?? null,
          };
        }
        case 'projects': {
          const id = row.id as ProjectId;
          const { status, color } = projectDetails.get(id)!;
          const external = projectRefs.get(id) ?? null;
          return { ...row, id, entityType: 'projects', status, color, external };
        }
        case 'notes': {
          const id = row.id as NoteId;
          return { ...row, id, entityType: 'notes', ...noteDetails.get(id)! };
        }
      }
    });
    return { items: entities, nextCursor };
  }

  private archivedPager(table: ArchivableTable, page: PageOptions) {
    return keyset<ArchivedRow>(
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

  /** the archived rows of one table, with the columns the three share */
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

// a row of the trash's union: the columns the three tables share, before each kind's own
type ArchivedRow = Pick<ArchivedEntity, 'title' | 'archivedAt'> & {
  id: ArchivableId;
  entityType: ArchivableEntityType;
};

const ARCHIVABLE_TABLES: Record<ArchivableEntityType, ArchivableTable> = {
  tasks,
  projects,
  notes,
};

/**
 * Throws unless every id in `ids` is a row of `table` in the trash: NotFoundError for an unknown
 * id, NotArchivedError for one that isn't archived. One query for them all.
 */
function assertInTrash(tx: Transaction, table: ArchivableTable, ids: ArchivableId[]): void {
  if (ids.length === 0) return;
  const archivedAt = new Map(
    tx
      .select({ id: sql<string>`${table.id}`, archivedAt: table.archivedAt })
      .from(table)
      .where(sql`${table.id} in (select value from json_each(${JSON.stringify(ids)}))`)
      .all()
      .map((row) => [row.id, row.archivedAt]),
  );
  for (const id of ids) {
    if (!archivedAt.has(id)) throw new NotFoundError(id);
    if (archivedAt.get(id) === null) throw new NotArchivedError(id);
  }
}

// What an archive will stamp: the tasks and notes, by title, including the tasks chosen. The same
// shape as the preview, which is the plan without the rows chosen.
type ArchivePlan = ArchivePreview;

/**
 * Plans archiving these tasks and projects, reading only: each task's subtree, each project's
 * tasks, and the notes linked to any of those tasks or to a project. Rows already in the trash are
 * left out (they keep when they were trashed). The one place that decides what an archive takes
 * along: archiveTask, archiveTasks and archiveProject apply the plan (applyArchivePlan), and
 * previewArchive lists it before the user confirms.
 */
function planArchive(
  tx: Transaction,
  { taskIds, projectIds }: Pick<TrashSelection, 'taskIds' | 'projectIds'>,
): ArchivePlan {
  const taskConditions = [
    taskIds.length > 0 ? inArray(tasks.id, subtreeOfAll(taskIds)) : undefined,
    projectIds.length > 0 ? inArray(tasks.projectId, projectIds) : undefined,
  ].filter((condition) => condition !== undefined);
  if (taskConditions.length === 0) return { tasks: [], notes: [] };
  const cascadedTasks = tx
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(and(or(...taskConditions), isNull(tasks.archivedAt)))
    .orderBy(tasks.title)
    .all();

  const taskIdsStamped = cascadedTasks.map((task) => task.id);
  const noteConditions = [
    taskIdsStamped.length > 0 ? inArray(notes.linkedTaskId, taskIdsStamped) : undefined,
    projectIds.length > 0 ? inArray(notes.projectId, projectIds) : undefined,
  ].filter((condition) => condition !== undefined);
  const cascadedNotes =
    noteConditions.length === 0
      ? []
      : tx
          .select({ id: notes.id, title: notes.title })
          .from(notes)
          .where(and(or(...noteConditions), isNull(notes.archivedAt)))
          .orderBy(notes.title)
          .all();
  return { tasks: cascadedTasks, notes: cascadedNotes };
}

/**
 * Carries out a `planArchive` in the same transaction: stamps its tasks and notes with `now`.
 * Returns the tasks as archived, and the ids stamped, for the `archived` change.
 */
function applyArchivePlan(
  tx: Transaction,
  plan: ArchivePlan,
  now = new Date(),
): { tasks: (typeof tasks.$inferSelect)[]; ids: Omit<ArchiveChangedIds, 'projectIds'> } {
  const taskIds = plan.tasks.map((task) => task.id);
  const noteIds = plan.notes.map((note) => note.id);
  const stamped =
    taskIds.length === 0
      ? []
      : tx
          .update(tasks)
          .set({ archivedAt: now })
          .where(inArray(tasks.id, taskIds))
          .returning()
          .all();
  if (noteIds.length > 0) {
    tx.update(notes).set({ archivedAt: now }).where(inArray(notes.id, noteIds)).run();
  }
  return { tasks: stamped, ids: { taskIds, noteIds } };
}

/**
 * Brings back what went to the trash with a task, which archiveTask stamped with the task's own
 * `archivedAt` (`trashedAt`): the task, the part of its subtree with that time, and the task notes
 * of those tasks with it too. A subtask or note trashed on its own before has another time, and
 * stays: one the user trashed, or a sub-issue sync moved to the trash in an earlier run. Returns
 * the ids restored.
 */
function restoreTaskTrashedWith(
  tx: Transaction,
  taskId: TaskId,
  trashedAt: Date,
): { taskIds: TaskId[]; noteIds: NoteId[] } {
  const taskIds = tx
    .update(tasks)
    .set({ archivedAt: null })
    .where(and(inArray(tasks.id, subtreeOf(taskId)), eq(tasks.archivedAt, trashedAt)))
    .returning({ id: tasks.id })
    .all()
    .map(({ id }) => id);
  const noteIds =
    taskIds.length === 0
      ? []
      : tx
          .update(notes)
          .set({ archivedAt: null })
          .where(and(inArray(notes.linkedTaskId, taskIds), eq(notes.archivedAt, trashedAt)))
          .returning({ id: notes.id })
          .all()
          .map(({ id }) => id);
  return { taskIds, noteIds };
}

/**
 * Brings back what went to the trash with a project, which archiveProject stamped with the
 * project's own `archivedAt` (`trashedAt`): its tasks, its notes, and the task notes of those
 * tasks. A task or note of the project trashed on its own before (or a task sync moved to the
 * trash) has another time, and stays. Returns the ids restored.
 */
function restoreProjectTrashedWith(
  tx: Transaction,
  projectId: ProjectId,
  trashedAt: Date,
): { taskIds: TaskId[]; noteIds: NoteId[] } {
  const taskIds = tx
    .update(tasks)
    .set({ archivedAt: null })
    .where(and(eq(tasks.projectId, projectId), eq(tasks.archivedAt, trashedAt)))
    .returning({ id: tasks.id })
    .all()
    .map(({ id }) => id);
  const noteIds = tx
    .update(notes)
    .set({ archivedAt: null })
    .where(
      and(
        eq(notes.archivedAt, trashedAt),
        taskIds.length > 0
          ? or(eq(notes.projectId, projectId), inArray(notes.linkedTaskId, taskIds))
          : eq(notes.projectId, projectId),
      ),
    )
    .returning({ id: notes.id })
    .all()
    .map(({ id }) => id);
  return { taskIds, noteIds };
}

/**
 * Restoring a row sync moved to the trash (its link `removed`: the item was deleted in the
 * provider, or left the synced scope) takes it back as the user's own copy: its link becomes
 * `detached`, as Detach leaves it. Sync then leaves it alone, so an item that comes back in the
 * provider no longer overwrites what the user changed since; Reattach hands it back. Synced and
 * detached links are left as they are. The renderer asks before a restore that does this.
 */
function detachRemovedLinks(tx: Transaction, taskIds: TaskId[], projectIds: ProjectId[]): void {
  const rows = [
    taskIds.length > 0 ? inArray(externalLinks.taskId, taskIds) : undefined,
    projectIds.length > 0 ? inArray(externalLinks.projectId, projectIds) : undefined,
  ].filter((condition) => condition !== undefined);
  if (rows.length === 0) return;
  tx.update(externalLinks)
    .set({ state: LinkState.DETACHED, removedAt: null })
    .where(and(eq(externalLinks.state, LinkState.REMOVED), or(...rows)))
    .run();
}
