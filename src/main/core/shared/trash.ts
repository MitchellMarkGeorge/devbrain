import { isId, NoteId, ProjectId, TaskId } from '@common/ids';
import { notes } from '@main/db/schema/notes';
import { projects } from '@main/db/schema/projects';
import { tasks } from '@main/db/schema/tasks';
import { RunResult } from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { AlreadyArchivedError, NotFoundError } from './errors';

// the rows the trash holds
export type TrashableId = TaskId | ProjectId | NoteId;

type Db = BaseSQLiteDatabase<'sync', RunResult>;

// the row's archivedAt: null when active, undefined when there is no row
function archivedAtOf(db: Db, id: TrashableId): Date | null | undefined {
  if (isId('task', id)) {
    return db.select({ at: tasks.archivedAt }).from(tasks).where(eq(tasks.id, id)).get()?.at;
  }
  if (isId('project', id)) {
    return db.select({ at: projects.archivedAt }).from(projects).where(eq(projects.id, id)).get()
      ?.at;
  }
  return db.select({ at: notes.archivedAt }).from(notes).where(eq(notes.id, id)).get()?.at;
}

/**
 * Refuses a user's write to a task, project or note in the trash (`archivedAt` set): such a row
 * opens read-only, and only the archive service restores or deletes it (docs/deleting.md, "Writes
 * to items in the trash"). Throws NotFoundError for an id with no row, and AlreadyArchivedError
 * for one in the trash.
 *
 * Services call this before any write a user makes, next to `assertEditable`. `SyncWriter` and the
 * archive service write archived rows through their own paths and skip it. Synchronous, so it also
 * runs inside a transaction (`db` can be one).
 */
export function assertNotTrashed(db: Db, id: TrashableId): void {
  const archivedAt = archivedAtOf(db, id);
  if (archivedAt === undefined) throw new NotFoundError(id);
  if (archivedAt !== null) throw new AlreadyArchivedError(id);
}

/** `assertNotTrashed` for a row already read, so it costs no query */
export function assertRowNotTrashed(row: { id: TrashableId; archivedAt: Date | null }): void {
  if (row.archivedAt !== null) throw new AlreadyArchivedError(row.id);
}
