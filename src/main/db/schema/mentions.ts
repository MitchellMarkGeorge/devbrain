import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { MentionSourceId, MentionTargetId } from '@common/types';

/**
 * Which items mention which: one row per source and target, from the `devbrain://` links in a
 * note's file or a task's, project's or event's description (MentionService). Kept by the service
 * on every save, never by the user; built once from what was there before (`index_builds`).
 *
 * No foreign keys: the source and the target are each one of several tables (their type is in
 * the id's prefix), so MentionService removes a deleted item's rows itself. A trashed source keeps
 * its rows, so a restore needs no reindex; lists leave it out by joining on its table.
 */
export const mentions = sqliteTable(
  'mentions',
  {
    sourceId: text().notNull().$type<MentionSourceId>(),
    targetId: text().notNull().$type<MentionTargetId>(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetId] }),
    // "what mentions this item": the lookup behind every Mentioned in
    index('idx_mentions_target_id').on(table.targetId),
  ],
);
