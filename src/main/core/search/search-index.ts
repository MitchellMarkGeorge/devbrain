import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { EventId, NoteId, ProjectId, TaskId } from '@common/ids';
import type { SearchEntityType } from '@common/types';

/**
 * The FTS5 table the index lives in (created by migration 0011), declared so queries can join it
 * with the query builder. It is outside src/main/db/schema, so drizzle-kit never sees it: the
 * table stays the migrations' to create and change.
 */
export const searchIndex = sqliteTable('search_index', {
  title: text().notNull(),
  body: text().notNull(),
  entityId: text().notNull().$type<NoteId | TaskId | ProjectId | EventId>(),
  entityType: text().notNull().$type<SearchEntityType>(),
});
