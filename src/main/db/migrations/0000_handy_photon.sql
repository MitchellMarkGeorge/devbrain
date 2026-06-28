CREATE TABLE `events` (
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
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`favorited_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_events_start_at` ON `events` (`start_at`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`preview` text,
	`project_id` text,
	`linked_event_id` text,
	`linked_task_id` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_link" CHECK(("notes"."linked_event_id" IS NOT NULL) + ("notes"."linked_task_id" IS NOT NULL) <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_linkedEventId_unique` ON `notes` (`linked_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notes_linkedTaskId_unique` ON `notes` (`linked_task_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_project_id` ON `notes` (`project_id`) WHERE "notes"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_event_id` ON `notes` (`linked_event_id`) WHERE "notes"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_note_id` ON `notes` (`linked_task_id`) WHERE "notes"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at` ON `notes` (`updated_at`) WHERE "notes"."archived_at" is not null;--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` integer,
	`due_date` integer NOT NULL,
	`color` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `tasks` (
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
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`favorited_at` integer,
	`completed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`linked_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "one_link" CHECK(("tasks"."linked_event_id" IS NOT NULL) + ("tasks"."linked_note_id" IS NOT NULL) <= 1)
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_task_id` ON `tasks` (`parent_task_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."archived_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."archived_at" is not null;