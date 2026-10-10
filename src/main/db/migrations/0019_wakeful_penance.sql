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
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "all_day_dates" CHECK(("__new_events"."all_day" = 1 AND "__new_events"."start_date" IS NOT NULL AND "__new_events"."end_date" IS NOT NULL) OR ("__new_events"."all_day" = 0 AND "__new_events"."start_date" IS NULL AND "__new_events"."end_date" IS NULL)),
	CONSTRAINT "series_original_start" CHECK("__new_events"."series_id" IS NULL OR "__new_events"."original_start_at" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `calendars`("id", "name") VALUES ('cal_default', 'DevBrain');--> statement-breakpoint
-- Hand-written copy: drizzle-kit selected the new columns from the old table. Every existing event
-- goes in the default calendar. An all-day event gets its dates: the local day it starts, and the
-- day after the last local day it touches (an end at midnight touches only the day before), and
-- its start_at and end_at become those dates' local midnights. reccurrence_rule is renamed.
INSERT INTO `__new_events`("id", "calendar_id", "title", "description", "start_at", "end_at", "all_day", "start_date", "end_date", "time_zone", "location", "recurrence_rule", "series_id", "original_start_at", "status", "response", "kind", "meeting_url", "color", "updated_at", "created_at", "favorited_at")
SELECT "id", 'cal_default', "title", "description",
  CASE WHEN "all_day" = 1 THEN CAST(strftime('%s', "start_date", 'utc') AS INTEGER) * 1000 ELSE "start_at" END,
  CASE WHEN "all_day" = 1 THEN CAST(strftime('%s', "end_date", 'utc') AS INTEGER) * 1000 ELSE "end_at" END,
  "all_day", "start_date", "end_date", NULL, "location", "reccurrence_rule", NULL, NULL, 'confirmed', NULL, 'default', "meeting_url", "color", "updated_at", "created_at", "favorited_at"
FROM (
  SELECT *,
    CASE WHEN "all_day" = 1 THEN date("start_at" / 1000, 'unixepoch', 'localtime') END AS "start_date",
    CASE WHEN "all_day" = 1 THEN date(max("end_at" - 1, "start_at") / 1000, 'unixepoch', 'localtime', '+1 day') END AS "end_date"
  FROM `events`
);--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_start_at_id` ON `events` (`start_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_events_calendar_id` ON `events` (`calendar_id`);--> statement-breakpoint
CREATE INDEX `idx_events_series_id` ON `events` (`series_id`) WHERE "events"."series_id" is not null;