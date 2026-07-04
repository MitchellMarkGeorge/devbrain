import { TaskId } from '@common/ids';
import { tasks } from '@main/db/schema/tasks';
import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { Task } from '../tasks/types';

export class ArchiveService {
  constructor(private readonly db: BetterSQLite3Database) {}

  async archiveTask(id: TaskId): Promise<Task> {
    const [task] = await this.db
      .update(tasks)
      .set({ archivedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }

  async restoreTask(id: TaskId): Promise<Task> {
    const [task] = await this.db
      .update(tasks)
      .set({ archivedAt: null })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  }
}
