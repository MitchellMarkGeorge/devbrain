ALTER TABLE `events` ADD `viewed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_events_viewed_at_id` ON `events` (`viewed_at`,`id`) WHERE "events"."viewed_at" is not null;--> statement-breakpoint
ALTER TABLE `notes` ADD `viewed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_notes_viewed_at_id` ON `notes` (`viewed_at`,`id`) WHERE ("notes"."viewed_at" is not null and "notes"."archived_at" is null);--> statement-breakpoint
ALTER TABLE `projects` ADD `viewed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_projects_viewed_at_id` ON `projects` (`viewed_at`,`id`) WHERE ("projects"."viewed_at" is not null and "projects"."archived_at" is null);--> statement-breakpoint
ALTER TABLE `tasks` ADD `viewed_at` integer;--> statement-breakpoint
CREATE INDEX `idx_tasks_viewed_at_id` ON `tasks` (`viewed_at`,`id`) WHERE ("tasks"."viewed_at" is not null and "tasks"."archived_at" is null);