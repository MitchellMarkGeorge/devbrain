PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`location` text,
	`reccurrence_rule` text,
	`meeting_url` text,
	`color` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "title", "description", "start_at", "end_at", "all_day", "location", "reccurrence_rule", "meeting_url", "color", "updated_at", "created_at", "favorited_at") SELECT "id", "title", "description", "start_at", "end_at", "all_day", "location", "reccurrence_rule", "meeting_url", "color", "updated_at", "created_at", "favorited_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_start_at` ON `events` (`start_at`);