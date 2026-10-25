CREATE TABLE `external_full_pass_listed` (
	`source_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`pass` text NOT NULL,
	`external_id` text NOT NULL,
	`original_start_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `external_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_external_full_pass_listed_pass` ON `external_full_pass_listed` (`source_id`,`pass`,`external_id`,`original_start_at`);--> statement-breakpoint
CREATE INDEX `idx_external_full_pass_listed_calendar_id` ON `external_full_pass_listed` (`calendar_id`);