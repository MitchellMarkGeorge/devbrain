import { TaskId, generateId, ProjectId, EventId, NoteId } from '@common/ids';
import { AnySQLiteColumn, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { TaskPriority, TaskStatus } from '../models/task';
import { timesamps, date, completedAt, archivedAt } from './utils';
import { projects } from './projects';
import { events } from './events';
import { notes } from './notes';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text()
      .primaryKey()
      .$type<TaskId>()
      .$default(() => generateId('task')),
    title: text().notNull(),
    description: text(),
    priority: text()
      .notNull()
      .$type<TaskPriority>()
      .$default(() => TaskPriority.LOW),
    status: text()
      .notNull()
      .$type<TaskStatus>()
      .$default(() => TaskStatus.NOT_STARTED),
    startDate: date(),
    dueDate: date().notNull(),
    parentTaskId: text()
      .$type<TaskId>()
      .references((): AnySQLiteColumn => tasks.id),
    projectId: text()
      .$type<ProjectId>()
      .references(() => projects.id),
    linkedEventId: text()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id),
    linkedNoteId: text()
      .$type<NoteId>()
      .references((): AnySQLiteColumn => notes.id),
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    // where archive is not null???
    index('idx_tasks_parent_task_id').on(table.parentTaskId),
    index('idx_tasks_project_id').on(table.projectId),
    index('idx_tasks_linked_note_id').on(table.linkedNoteId),
    index('idx_tasks_linked_event_id').on(table.linkedEventId),
    // having status here first filters out by status first, then followed by due date
    index('idx_tasks_status_due_date').on(table.status, table.dueDate),
  ],
); // no dindex on status and priority as they are low cardinality values
