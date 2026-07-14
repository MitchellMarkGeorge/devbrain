PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start_date` integer,
	`due_date` integer NOT NULL,
	`color` text,
	`status` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
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
CREATE INDEX `idx_projects_status_due_date` ON `projects` (`status`,`due_date`) WHERE "projects"."archived_at" is not null;