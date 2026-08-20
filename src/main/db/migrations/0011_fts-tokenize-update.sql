-- Custom SQL migration file, put your code below! --
DROP TABLE IF EXISTS search_index;
--> statement-breakpoint
CREATE VIRTUAL TABLE search_index USING fts5(
    title,
    body,
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    tokenize = "unicode61 remove_diacritics 2 tokenchars '_+#'",
    prefix = '2 3 4'
);