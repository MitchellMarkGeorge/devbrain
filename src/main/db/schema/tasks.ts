import { TaskId, generateId, ProjectId, EventId, NoteId } from '@common/ids';
import { AnySQLiteColumn, index, sqliteTable, text, check, integer } from 'drizzle-orm/sqlite-core';
import { TaskPriority, TaskStatus } from '../../core/tasks/types';
import { timesamps, date, completedAt, archivedAt } from './utils';
import { projects } from './projects';
import { events } from './events';
import { notes } from './notes';
import { isNull, sql } from 'drizzle-orm';

// CONFIRM FILE NAMING CONVENTIONS

export const tasks = sqliteTable(
  'tasks',
  {
    id: text()
      .primaryKey()
      .$type<TaskId>()
      .$default(() => generateId('task')),
    title: text().notNull(),
    description: text(),
    priority: integer().notNull().$type<TaskPriority>().default(TaskPriority.LOW), // SQL defualt
    status: integer().notNull().$type<TaskStatus>().default(TaskStatus.NOT_STARTED),
    startDate: date(),
    dueDate: date().notNull(),
    parentTaskId: text()
      .$type<TaskId>()
      .references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    projectId: text()
      .$type<ProjectId>()
      .references(() => projects.id, { onDelete: 'set null' }),
    // these refer to either the event or note that created/is linked with this task
    linkedEventId: text()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id, { onDelete: 'set null' }),
    linkedNoteId: text()
      .$type<NoteId>()
      .references((): AnySQLiteColumn => notes.id, { onDelete: 'set null' }),
    pullRequestUrl: text(), // should be more generic to allow things like issue/tickets links
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    // NOTE: there is intentionally no standalone index on parent_task_id. It is the leading
    // column of idx_tasks_parent_created_at_id (below), which serves every lookup by parent
    // (listSubtasks, demoteTask's child count), so a separate one would be redundant and only
    // add write overhead.
    index('idx_tasks_project_id').on(table.projectId).where(isNull(table.archivedAt)),
    index('idx_tasks_linked_note_id').on(table.linkedNoteId).where(isNull(table.archivedAt)),
    index('idx_tasks_linked_event_id').on(table.linkedEventId).where(isNull(table.archivedAt)),
    // having status here first filters out by status first, then followed by due date
    index('idx_tasks_status_due_date')
      .on(table.status, table.dueDate)
      .where(isNull(table.archivedAt)),

    // keyset pagination in TaskService.listTasks: (sort column, id), either direction
    // (sqlite can scan an index backwards). `where` must match the query's archived filter.
    index('idx_tasks_due_date_id').on(table.dueDate, table.id).where(isNull(table.archivedAt)),
    index('idx_tasks_priority_id').on(table.priority, table.id).where(isNull(table.archivedAt)),
    index('idx_tasks_status_id').on(table.status, table.id).where(isNull(table.archivedAt)),
    index('idx_tasks_created_at_id').on(table.createdAt, table.id).where(isNull(table.archivedAt)),
    index('idx_tasks_updated_at_id').on(table.updatedAt, table.id).where(isNull(table.archivedAt)),
    // TaskService.listSubtasks: subtasks of a parent ordered by createdAt
    index('idx_tasks_parent_created_at_id')
      .on(table.parentTaskId, table.createdAt, table.id)
      .where(isNull(table.archivedAt)),

    // make sure there is one link if any
    check(
      'one_link',
      sql`(${table.linkedEventId} IS NOT NULL) + (${table.linkedNoteId} IS NOT NULL) <= 1`,
    ),

    // completedAt only has a value if the task's status is completed
    check(
      'completed_at_consistency',
      sql`(${table.status} = ${sql.raw(String(TaskStatus.COMPLETED))}) = (${table.completedAt} IS NOT NULL)`,
    ),
  ],
);
