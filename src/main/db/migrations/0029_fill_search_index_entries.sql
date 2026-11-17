-- Every search entry gets its row in search_index_entries, keyed by the FTS row's rowid. An entity
-- indexed twice keeps its newest entry: its older ones would be left out of the map, and so never
-- replaced or removed again.
DELETE FROM search_index WHERE rowid NOT IN (SELECT max(rowid) FROM search_index GROUP BY entity_id);
--> statement-breakpoint
INSERT INTO search_index_entries (row_id, entity_id) SELECT rowid, entity_id FROM search_index;
