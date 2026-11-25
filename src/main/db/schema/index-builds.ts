import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { date } from './utils';

/** the indexes core derives from the workspace's content */
export type IndexName = 'search' | 'mentions';

/**
 * The indexes that have been built from everything in the workspace, by name, so opening it builds
 * one only if it never was (Workspace.startIndexes): each rebuild (SearchService, MentionService)
 * writes its row in the same transaction as the entries it builds, and saves keep it in step after
 * that. A migration that changes an index deletes its row, in a data migration of its own, so the
 * next open fills it again.
 */
export const indexBuilds = sqliteTable('index_builds', {
  name: text().primaryKey().$type<IndexName>(),
  builtAt: date().notNull(),
});
