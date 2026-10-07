PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` integer,
	`due_date` integer,
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
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_projects_status_due_date` ON `projects` (`status`,`due_date`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_due_date_id` ON `projects` (`due_date`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_due_date_nulls_last_id` ON `projects` (("due_date" IS NULL),`due_date`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_status_id` ON `projects` (`status`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_created_at_id` ON `projects` (`created_at`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_updated_at_id` ON `projects` (`updated_at`,`id`) WHERE "projects"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_archived_at_id` ON `projects` (`archived_at`,`id`) WHERE "projects"."archived_at" is not null;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` integer DEFAULT 1 NOT NULL,
	`status` integer DEFAULT 1 NOT NULL,
	`start_date` integer,
	`due_date` integer,
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
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date_id` ON `tasks` (`due_date`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date_nulls_last_id` ON `tasks` (("due_date" IS NULL),`due_date`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_priority_id` ON `tasks` (`priority`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_id` ON `tasks` (`status`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at_id` ON `tasks` (`created_at`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_updated_at_id` ON `tasks` (`updated_at`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_created_at_id` ON `tasks` (`parent_task_id`,`created_at`,`id`) WHERE "tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_archived_at_id` ON `tasks` (`archived_at`,`id`) WHERE "tasks"."archived_at" is not null;