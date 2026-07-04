PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'low' NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`start_date` integer,
	`due_date` integer NOT NULL,
	`parent_task_id` text,
	`project_id` text,
	`linked_event_id` text,
	`linked_note_id` text,
	`pull_request_url` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_link" CHECK(("__new_tasks"."linked_event_id" IS NOT NULL) + ("__new_tasks"."linked_note_id" IS NOT NULL) <= 1),
	CONSTRAINT "completed_at_consistency" CHECK(("__new_tasks"."status" = 'completed') = ("__new_tasks"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "title", "description", "priority", "status", "start_date", "due_date", "parent_task_id", "project_id", "linked_event_id", "linked_note_id", "pull_request_url", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at") SELECT "id", "title", "description", "priority", "status", "start_date", "due_date", "parent_task_id", "project_id", "linked_event_id", "linked_note_id", "pull_request_url", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_task_id` ON `tasks` (`parent_task_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."archived_at" is not null;