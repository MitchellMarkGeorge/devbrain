import { TaskId, generateId, ProjectId, EventId, NoteId } from '@common/ids';
import { AnySQLiteColumn, index, sqliteTable, text, check } from 'drizzle-orm/sqlite-core';
import { TaskPriority, TaskStatus } from '../../core/tasks/types';
import { timesamps, date, completedAt, archivedAt } from './utils';
import { projects } from './projects';
import { events } from './events';
import { notes } from './notes';
import { isNotNull, sql } from 'drizzle-orm';

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
    priority: text().notNull().$type<TaskPriority>().default(TaskPriority.LOW), // SQL defualt
    status: text().notNull().$type<TaskStatus>().default(TaskStatus.NOT_STARTED),
    startDate: date(),
    dueDate: date().notNull(),
    parentTaskId: text()
      .$type<TaskId>()
      .references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    projectId: text()
      .$type<ProjectId>()
      .references(() => projects.id, { onDelete: 'set null' }),
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
    index('idx_tasks_parent_task_id').on(table.parentTaskId).where(isNotNull(table.archivedAt)),
    index('idx_tasks_project_id').on(table.projectId).where(isNotNull(table.archivedAt)),
    index('idx_tasks_linked_note_id').on(table.linkedNoteId).where(isNotNull(table.archivedAt)),
    index('idx_tasks_linked_event_id').on(table.linkedEventId).where(isNotNull(table.archivedAt)),
    // having status here first filters out by status first, then followed by due date
    index('idx_tasks_status_due_date')
      .on(table.status, table.dueDate)
      .where(isNotNull(table.archivedAt)),

    // make sure there is one link if any
    check(
      'one_link',
      sql`(${table.linkedEventId} IS NOT NULL) + (${table.linkedNoteId} IS NOT NULL) <= 1`,
    ),
  ],
);
