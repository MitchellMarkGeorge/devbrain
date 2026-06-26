import { NoteId, generateId, ProjectId, EventId, TaskId } from '@common/ids';
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
// import { projects, events, tasks } from "../schema";
import { timesamps, completedAt, archivedAt } from './utils';
import { tasks } from './tasks';
import { projects } from './projects';
import { events } from './events';

export const notes = sqliteTable(
  'notes',
  {
    id: text()
      .primaryKey()
      .$type<NoteId>()
      .$default(() => generateId('note')),
    title: text().notNull(), // should this be not null?
    preview: text(),
    projectId: text()
      .$type<ProjectId>()
      .references(() => projects.id),
    linkedEventId: text()
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id),
    linkedTaskId: text()
      .$type<TaskId>()
      .references((): AnySQLiteColumn => tasks.id),
    // should the file path be stored or be generated?
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    index('idx_notes_project_id').on(table.projectId),
    index('idx_notes_linked_event_id').on(table.linkedEventId),
    index('idx_notes_linked_note_id').on(table.linkedTaskId),
    index('idx_notes_linked_note_id').on(table.linkedTaskId),
    index('idx_notes_updated_at').on(table.updatedAt),
  ],
); // add indexes
