import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { date } from './utils';

/**
 * The indexes core derives from the workspace's content and has built once, by name, so opening a
 * workspace builds one only if it never was: `mentions` (MentionService.rebuild) writes its row in
 * the same transaction as the rows it builds. After that each index is kept in step by saves.
 */
export const indexBuilds = sqliteTable('index_builds', {
  name: text().primaryKey().$type<'mentions'>(),
  builtAt: date().notNull(),
});
