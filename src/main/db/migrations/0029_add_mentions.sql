CREATE TABLE `index_builds` (
	`name` text PRIMARY KEY NOT NULL,
	`built_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mentions` (
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`count` integer NOT NULL,
	`context_before` text NOT NULL,
	`context_after` text NOT NULL,
	PRIMARY KEY(`source_id`, `target_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_mentions_target_id` ON `mentions` (`target_id`);