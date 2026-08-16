PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`all_day` integer,
	`location` text,
	`reccurrence_rule` text,
	`meeting_url` text,
	`color` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "title", "description", "start_at", "end_at", "all_day", "location", "reccurrence_rule", "meeting_url", "color", "updated_at", "created_at", "favorited_at") SELECT "id", "title", "description", "start_at", "end_at", "all_day", "location", "reccurrence_rule", "meeting_url", "color", "updated_at", "created_at", "favorited_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_events_start_at` ON `events` (`start_at`);--> statement-breakpoint
CREATE TABLE `__new_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`file_path` text NOT NULL,
	`preview` text,
	`project_id` text,
	`linked_event_id` text,
	`linked_task_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_link" CHECK(("__new_notes"."linked_event_id" IS NOT NULL) + ("__new_notes"."linked_task_id" IS NOT NULL) <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_notes`("id", "title", "file_path", "preview", "project_id", "linked_event_id", "linked_task_id", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at") SELECT "id", "title", "file_path", "preview", "project_id", "linked_event_id", "linked_task_id", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at" FROM `notes`;--> statement-breakpoint
DROP TABLE `notes`;--> statement-breakpoint
ALTER TABLE `__new_notes` RENAME TO `notes`;--> statement-breakpoint
CREATE UNIQUE INDEX `notes_linkedEventId_unique` ON `notes` (`linked_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_linkedTaskId_unique` ON `notes` (`linked_task_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_project_id` ON `notes` (`project_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_event_id` ON `notes` (`linked_event_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_task_id` ON `notes` (`linked_task_id`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`) WHERE "notes"."archived_at" is null;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` integer,
	`due_date` integer NOT NULL,
	`color` text,
	`status` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	CONSTRAINT "completed_at_consistency" CHECK(("__new_projects"."status" = 4) = ("__new_projects"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "title", "description", "start_date", "due_date", "color", "status", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at") SELECT "id", "title", "description", "start_date", "due_date", "color", "status", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE INDEX `idx_projects_status_due_date` ON `projects` (`status`,`due_date`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` integer DEFAULT 1 NOT NULL,
	`status` integer DEFAULT 1 NOT NULL,
	`start_date` integer,
	`due_date` integer NOT NULL,
	`parent_task_id` text,
	`project_id` text,
	`linked_event_id` text,
	`linked_note_id` text,
	`pull_request_url` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_link" CHECK(("__new_tasks"."linked_event_id" IS NOT NULL) + ("__new_tasks"."linked_note_id" IS NOT NULL) <= 1),
	CONSTRAINT "completed_at_consistency" CHECK(("__new_tasks"."status" = 3) = ("__new_tasks"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "title", "description", "priority", "status", "start_date", "due_date", "parent_task_id", "project_id", "linked_event_id", "linked_note_id", "pull_request_url", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at") SELECT "id", "title", "description", "priority", "status", "start_date", "due_date", "parent_task_id", "project_id", "linked_event_id", "linked_note_id", "pull_request_url", "updated_at", "created_at", "favorited_at", "completed_at", "archived_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_task_id` ON `tasks` (`parent_task_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."archived_at" is null;