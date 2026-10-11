ALTER TABLE `events` RENAME COLUMN "reccurrence_rule" TO "recurrence_rule";--> statement-breakpoint
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`external_id` text,
	`name` text NOT NULL,
	`color` text,
	`time_zone` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`selected` integer DEFAULT true NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `external_sources`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_calendars_source_external_id` ON `calendars` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `event_exceptions` (
	`series_id` text NOT NULL,
	`original_start_at` integer NOT NULL,
	PRIMARY KEY(`series_id`, `original_start_at`),
	FOREIGN KEY (`series_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `external_event_exceptions` (
	`source_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`master_external_id` text NOT NULL,
	`original_start_at` integer NOT NULL,
	PRIMARY KEY(`source_id`, `master_external_id`, `original_start_at`),
	FOREIGN KEY (`source_id`) REFERENCES `external_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `events` ADD `calendar_id` text DEFAULT 'cal_default' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `events` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `events` ADD `time_zone` text;--> statement-breakpoint
ALTER TABLE `events` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `original_start_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `status` text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `response` text;--> statement-breakpoint
ALTER TABLE `events` ADD `kind` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_events_calendar_id` ON `events` (`calendar_id`);--> statement-breakpoint
CREATE INDEX `idx_events_series_id` ON `events` (`series_id`) WHERE "events"."series_id" is not null;