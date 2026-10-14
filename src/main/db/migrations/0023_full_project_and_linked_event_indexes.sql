CREATE INDEX `idx_notes_project_id_all` ON `notes` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id_all` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id_all` ON `tasks` (`linked_event_id`);