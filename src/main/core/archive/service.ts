import { TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { and, isNull, sql } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Task } from '../tasks/types';

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
}
