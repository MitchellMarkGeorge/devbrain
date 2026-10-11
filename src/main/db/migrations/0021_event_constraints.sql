PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text DEFAULT 'cal_default' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`start_date` text,
	`end_date` text,
	`time_zone` text,
	`location` text,
	`recurrence_rule` text,
	`series_id` text,
	`original_start_at` integer,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`response` text,
	`kind` text DEFAULT 'default' NOT NULL,
	`meeting_url` text,
	`color` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "all_day_dates" CHECK(("__new_events"."all_day" = 1 AND "__new_events"."start_date" IS NOT NULL AND "__new_events"."end_date" IS NOT NULL) OR ("__new_events"."all_day" = 0 AND "__new_events"."start_date" IS NULL AND "__new_events"."end_date" IS NULL)),
	CONSTRAINT "series_original_start" CHECK("__new_events"."series_id" IS NULL OR "__new_events"."original_start_at" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "calendar_id", "title", "description", "start_at", "end_at", "all_day", "start_date", "end_date", "time_zone", "location", "recurrence_rule", "series_id", "original_start_at", "status", "response", "kind", "meeting_url", "color", "updated_at", "created_at", "favorited_at") SELECT "id", "calendar_id", "title", "description", "start_at", "end_at", "all_day", "start_date", "end_date", "time_zone", "location", "recurrence_rule", "series_id", "original_start_at", "status", "response", "kind", "meeting_url", "color", "updated_at", "created_at", "favorited_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_start_at_id` ON `events` (`start_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_events_calendar_id` ON `events` (`calendar_id`);--> statement-breakpoint
CREATE INDEX `idx_events_series_id` ON `events` (`series_id`) WHERE "events"."series_id" is not null;