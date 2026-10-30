import { NoteId, generateId, ProjectId, EventId, TaskId } from '@common/ids';
import { sqliteTable, text, index, check } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
// import { projects, events, tasks } from "../schema";
import { timesamps, completedAt, archivedAt } from './utils';
import { tasks } from './tasks';
import { projects } from './projects';
import { events } from './events';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';

export const notes = sqliteTable(
  'notes',
  {
    id: text()
      .primaryKey()
      .$type<NoteId>()
      .$default(() => generateId('note')),
    title: text().notNull(), // should this be not null?
    filePath: text().notNull(), // adding this for flexibiliy
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
    ...timesamps,
    ...completedAt,
    ...archivedAt,
  },
  (table) => [
    index('idx_notes_project_id').on(table.projectId).where(isNull(table.archivedAt)),
    // a full index beside the partial one, for lookups that include archived notes: what a
    // disconnect keeps (an archived note still keeps its project), and the foreign key that nulls
    // project_id when a project is deleted
    index('idx_notes_project_id_all').on(table.projectId),
    index('idx_notes_linked_event_id').on(table.linkedEventId).where(isNull(table.archivedAt)),
    index('idx_notes_linked_task_id').on(table.linkedTaskId).where(isNull(table.archivedAt)),
    // keyset pagination in NoteService.listNotes: (sort column, id), either direction
    // (sqlite can scan an index backwards). `where` must match the query's archived filter.
    index('idx_notes_updated_at_id').on(table.updatedAt, table.id).where(isNull(table.archivedAt)),
    index('idx_notes_created_at_id').on(table.createdAt, table.id).where(isNull(table.archivedAt)),
    index('idx_notes_title_id').on(table.title, table.id).where(isNull(table.archivedAt)),
    // keyset pagination in ArchiveService.listArchived: the inverse of the partial indexes above,
    // covering only archived rows. `where` must match the query's archived filter.
    index('idx_notes_archived_at_id')
      .on(table.archivedAt, table.id)
      .where(isNotNull(table.archivedAt)),
    // keyset pagination in FavoritesService.listFavorites: favorited rows that are not archived.
    // `where` must match the query's filter.
    index('idx_notes_favorited_at_id')
      .on(table.favoritedAt, table.id)
      .where(and(isNotNull(table.favoritedAt), isNull(table.archivedAt))!),
    // keyset pagination in RecentsService.listRecents: viewed rows that are not archived.
    // `where` must match the query's filter.
    index('idx_notes_viewed_at_id')
      .on(table.viewedAt, table.id)
      .where(and(isNotNull(table.viewedAt), isNull(table.archivedAt))!),

    // make sure there is one link if any
    check(
      'one_link',
      sql`(${table.linkedEventId} IS NOT NULL) + (${table.linkedTaskId} IS NOT NULL) <= 1`,
    ),
  ],
);
