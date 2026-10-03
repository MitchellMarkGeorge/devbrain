DROP INDEX `idx_events_start_at`;--> statement-breakpoint
CREATE INDEX `idx_events_start_at_id` ON `events` (`start_at`,`id`);--> statement-breakpoint
DROP INDEX `idx_notes_updated_at`;--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at_id` ON `notes` (`updated_at`,`id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_created_at_id` ON `notes` (`created_at`,`id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_title_id` ON `notes` (`title`,`id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_due_date_id` ON `projects` (`due_date`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_status_id` ON `projects` (`status`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_created_at_id` ON `projects` (`created_at`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_updated_at_id` ON `projects` (`updated_at`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date_id` ON `tasks` (`due_date`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_priority_id` ON `tasks` (`priority`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_id` ON `tasks` (`status`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at_id` ON `tasks` (`created_at`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_updated_at_id` ON `tasks` (`updated_at`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_created_at_id` ON `tasks` (`parent_task_id`,`created_at`,`id`) WHERE "tasks"."archived_at" is null;