import { ProjectId, TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Task } from '../tasks/types';
import { Project } from '../projects/types';
import { projects } from '@main/db/schema/projects';

export class ArchiveService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async archiveTask(id: TaskId): Promise<Task> {
    // archives a task and any subtasks it has
    const [task] = await this.db
      .update(tasks)
      .set({ archivedAt: new Date() })
      .where(
        and(sql`${tasks.id} = ${id} OR ${tasks.parentTaskId} = ${id}`, isNull(tasks.archivedAt)),
      )
      .returning();
    return task;
  }

  async restoreTask(id: TaskId): Promise<Task> {
    // restores a task and any subtasks it has
    const [task] = await this.db
      .update(tasks)
      .set({ archivedAt: null })
      .where(sql`${tasks.id} = ${id} OR ${tasks.parentTaskId} = ${id}`)
      .returning();
    return task;
  }

  async archiveProject(id: ProjectId): Promise<Project> {
    return this.db.transaction((tx) => {
      const now = new Date();
      // archive the project
      const project = tx
        .update(projects)
        .set({
          archivedAt: now,
        })
        .where(and(eq(projects.id, id), isNull(projects.archivedAt)))
        .returning()
        .get();

      // archive all tasks (and subtasks) attached to the project
      tx.update(tasks).set({ archivedAt: now }).where(eq(tasks.projectId, id)).run();

      return project;
    });
  }

  async restoreProject(id: ProjectId): Promise<Project> {
    return this.db.transaction((tx) => {
      // restore archived project
      const project = tx
        .update(projects)
        .set({
          archivedAt: null,
        })
        .where(and(eq(projects.id, id), isNotNull(projects.archivedAt)))
        .returning()
        .get();

      // restore all archived tasks (and subtasks) attached to the project
      tx.update(tasks).set({ archivedAt: null }).where(eq(tasks.projectId, id)).run();

      return project;
    });
  }
}
