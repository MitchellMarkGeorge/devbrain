DROP INDEX `idx_notes_linked_note_id`;--> statement-breakpoint
DROP INDEX `idx_notes_project_id`;--> statement-breakpoint
DROP INDEX `idx_notes_linked_event_id`;--> statement-breakpoint
DROP INDEX `idx_notes_updated_at`;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_task_id` ON `notes` (`linked_task_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_project_id` ON `notes` (`project_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_event_id` ON `notes` (`linked_event_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
DROP INDEX `idx_projects_status_due_date`;--> statement-breakpoint
CREATE INDEX `idx_projects_status_due_date` ON `projects` (`status`,`due_date`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
DROP INDEX `idx_tasks_parent_task_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_project_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_linked_note_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_linked_event_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_status_due_date`;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_task_id` ON `tasks` (`parent_task_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."archived_at" is null;