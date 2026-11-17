import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Where each entity's entry sits in the search index (`search_index`, an FTS5 table made by
 * migration 0011 and declared in core/search/search-index.ts): the FTS row's rowid, by entity id.
 * FTS5 can't index `entity_id`, so replacing or dropping an entry by id read the whole index
 * (about 6 ms per entry at 10,000 tasks; a bulk edit of 200 tasks took most of a second). Through
 * this table it is a lookup by rowid. SearchService keeps the two in step: every entry has one
 * row here, and its FTS row is inserted with `row_id` as its rowid.
 */
export const searchIndexEntries = sqliteTable('search_index_entries', {
  // the search_index row's rowid; SQLite picks the next one when an entry is added
  rowId: integer().primaryKey(),
  entityId: text().notNull().unique(),
});
