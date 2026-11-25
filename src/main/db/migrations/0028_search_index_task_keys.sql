-- Search finds a synced task by its provider key (ENG-123), held in a new `key` column. FTS5 can't
-- add a column, so the index is rebuilt: the entries are copied, not dropped, as note bodies come
-- from files SQL can't read, and each task's key is taken from its link.
CREATE VIRTUAL TABLE search_index_new USING fts5(
    title,
    body,
    key,
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    tokenize = "unicode61 remove_diacritics 2 tokenchars '_+#'",
    prefix = '2 3 4'
);
--> statement-breakpoint
INSERT INTO search_index_new (title, body, key, entity_id, entity_type)
SELECT
    s.title,
    s.body,
    coalesce(
        (SELECT `external_key` FROM `external_links` WHERE `task_id` = s.entity_id),
        ''
    ),
    s.entity_id,
    s.entity_type
FROM search_index s;
--> statement-breakpoint
DROP TABLE search_index;
--> statement-breakpoint
ALTER TABLE search_index_new RENAME TO search_index;
