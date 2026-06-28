-- Custom SQL migration file, put your code below! --
CREATE VIRTUAL TABLE search_index USING fts5(
    title,
    body,
    entity_id UNINDEXED,
    entity_type UNINDEXED,
    tokenize = "unicode61 remove_diacritics 2 tokenchars '_'",
    prefix = '2 3 4'
);