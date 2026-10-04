CREATE INDEX `idx_notes_archived_at_id` ON `notes` (`archived_at`,`id`) WHERE "notes"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_projects_archived_at_id` ON `projects` (`archived_at`,`id`) WHERE "projects"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_archived_at_id` ON `tasks` (`archived_at`,`id`) WHERE "tasks"."archived_at" is not null;