import { NoteId, ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Task } from '../tasks/types';
import { Project } from '../projects/types';
import { projects } from '@main/db/schema/projects';
import { Note } from '../notes/types';
import { notes } from '@main/db/schema/notes';
import { AlreadyArchivedError, NotArchivedError, NotFoundError } from '../shared/errors';

export class ArchiveService {
  constructor(private readonly db: BetterSQLite3Database) {}

  archiveTask(id: TaskId): Task {
    return this.db.transaction((tx) => {
      const existing = tx.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) throw new NotFoundError(id);
      if (existing.archivedAt !== null) throw new AlreadyArchivedError(id);

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
}
