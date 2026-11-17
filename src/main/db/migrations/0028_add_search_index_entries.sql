CREATE TABLE `search_index_entries` (
	`row_id` integer PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_index_entries_entityId_unique` ON `search_index_entries` (`entity_id`);