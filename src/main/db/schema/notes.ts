import { NoteId, generateId, ProjectId, EventId, TaskId } from '../../../common/ids';
import { sqliteTable, text, index, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
// import { projects, events, tasks } from "../schema";
import { timesamps, completedAt, archivedAt } from './utils';
import { tasks } from './tasks';
import { projects } from './projects';
import { events } from './events';
import { isNotNull, sql } from 'drizzle-orm';

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
      .references(() => projects.id, { onDelete: 'set null' }),
    linkedEventId: text()
      .unique() // an event can only have one note
      .$type<EventId>()
      .references((): AnySQLiteColumn => events.id, { onDelete: 'set null' }),
    linkedTaskId: text()
      .unique() // a task can only have one "task note"
      .$type<TaskId>()
      // this refrences the task that has this note as its "task note"
      .references((): AnySQLiteColumn => tasks.id, { onDelete: 'set null' }),
    // should the file path be stored or be generated?
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    index('idx_notes_project_id').on(table.projectId).where(isNotNull(table.archivedAt)),
    index('idx_notes_linked_event_id').on(table.linkedEventId).where(isNotNull(table.archivedAt)),
    index('idx_notes_linked_note_id').on(table.linkedTaskId).where(isNotNull(table.archivedAt)),
    index('idx_notes_linked_note_id').on(table.linkedTaskId).where(isNotNull(table.archivedAt)),
    index('idx_notes_updated_at').on(table.updatedAt).where(isNotNull(table.archivedAt)),

    // make sure there is one link if any
    check(
      'one_link',
      sql`(${table.linkedEventId} IS NOT NULL) + (${table.linkedTaskId} IS NOT NULL) <= 1`,
    ),
  ],
);
