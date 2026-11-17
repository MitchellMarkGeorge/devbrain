ALTER TABLE `notes` RENAME COLUMN "archived_at" TO "trashed_at";--> statement-breakpoint
ALTER TABLE `projects` RENAME COLUMN "archived_at" TO "trashed_at";--> statement-breakpoint
ALTER TABLE `tasks` RENAME COLUMN "archived_at" TO "trashed_at";--> statement-breakpoint
DROP INDEX `idx_notes_archived_at_id`;--> statement-breakpoint
DROP INDEX `idx_notes_project_id`;--> statement-breakpoint
DROP INDEX `idx_notes_linked_event_id`;--> statement-breakpoint
DROP INDEX `idx_notes_linked_task_id`;--> statement-breakpoint
DROP INDEX `idx_notes_updated_at_id`;--> statement-breakpoint
DROP INDEX `idx_notes_created_at_id`;--> statement-breakpoint
DROP INDEX `idx_notes_title_id`;--> statement-breakpoint
DROP INDEX `idx_notes_favorited_at_id`;--> statement-breakpoint
DROP INDEX `idx_notes_viewed_at_id`;--> statement-breakpoint
CREATE INDEX `idx_notes_trashed_at_id` ON `notes` (`trashed_at`,`id`) WHERE "notes"."trashed_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_notes_project_id` ON `notes` (`project_id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_event_id` ON `notes` (`linked_event_id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_linked_task_id` ON `notes` (`linked_task_id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_updated_at_id` ON `notes` (`updated_at`,`id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_created_at_id` ON `notes` (`created_at`,`id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_title_id` ON `notes` (`title`,`id`) WHERE "notes"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_notes_favorited_at_id` ON `notes` (`favorited_at`,`id`) WHERE ("notes"."favorited_at" is not null and "notes"."trashed_at" is null);--> statement-breakpoint
CREATE INDEX `idx_notes_viewed_at_id` ON `notes` (`viewed_at`,`id`) WHERE ("notes"."viewed_at" is not null and "notes"."trashed_at" is null);--> statement-breakpoint
DROP INDEX `idx_projects_archived_at_id`;--> statement-breakpoint
DROP INDEX `idx_projects_status_due_date`;--> statement-breakpoint
DROP INDEX `idx_projects_due_date_id`;--> statement-breakpoint
DROP INDEX `idx_projects_due_date_nulls_last_id`;--> statement-breakpoint
DROP INDEX `idx_projects_status_id`;--> statement-breakpoint
DROP INDEX `idx_projects_created_at_id`;--> statement-breakpoint
DROP INDEX `idx_projects_updated_at_id`;--> statement-breakpoint
DROP INDEX `idx_projects_favorited_at_id`;--> statement-breakpoint
DROP INDEX `idx_projects_viewed_at_id`;--> statement-breakpoint
CREATE INDEX `idx_projects_trashed_at_id` ON `projects` (`trashed_at`,`id`) WHERE "projects"."trashed_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_projects_status_due_date` ON `projects` (`status`,`due_date`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_due_date_id` ON `projects` (`due_date`,`id`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_due_date_nulls_last_id` ON `projects` (("due_date" IS NULL),`due_date`,`id`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_status_id` ON `projects` (`status`,`id`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_created_at_id` ON `projects` (`created_at`,`id`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_updated_at_id` ON `projects` (`updated_at`,`id`) WHERE "projects"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_projects_favorited_at_id` ON `projects` (`favorited_at`,`id`) WHERE ("projects"."favorited_at" is not null and "projects"."trashed_at" is null);--> statement-breakpoint
CREATE INDEX `idx_projects_viewed_at_id` ON `projects` (`viewed_at`,`id`) WHERE ("projects"."viewed_at" is not null and "projects"."trashed_at" is null);--> statement-breakpoint
DROP INDEX `idx_tasks_archived_at_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_project_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_linked_note_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_linked_event_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_status_due_date`;--> statement-breakpoint
DROP INDEX `idx_tasks_due_date_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_due_date_nulls_last_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_priority_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_status_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_created_at_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_updated_at_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_parent_created_at_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_favorited_at_id`;--> statement-breakpoint
DROP INDEX `idx_tasks_viewed_at_id`;--> statement-breakpoint
CREATE INDEX `idx_tasks_trashed_at_id` ON `tasks` (`trashed_at`,`id`) WHERE "tasks"."trashed_at" is not null;--> statement-breakpoint
CREATE INDEX `idx_tasks_project_id` ON `tasks` (`project_id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_note_id` ON `tasks` (`linked_note_id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_linked_event_id` ON `tasks` (`linked_event_id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_due_date` ON `tasks` (`status`,`due_date`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date_id` ON `tasks` (`due_date`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_due_date_nulls_last_id` ON `tasks` (("due_date" IS NULL),`due_date`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_priority_id` ON `tasks` (`priority`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_status_id` ON `tasks` (`status`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at_id` ON `tasks` (`created_at`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_updated_at_id` ON `tasks` (`updated_at`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_parent_created_at_id` ON `tasks` (`parent_task_id`,`created_at`,`id`) WHERE "tasks"."trashed_at" is null;--> statement-breakpoint
CREATE INDEX `idx_tasks_favorited_at_id` ON `tasks` (`favorited_at`,`id`) WHERE ("tasks"."favorited_at" is not null and "tasks"."trashed_at" is null);--> statement-breakpoint
CREATE INDEX `idx_tasks_viewed_at_id` ON `tasks` (`viewed_at`,`id`) WHERE ("tasks"."viewed_at" is not null and "tasks"."trashed_at" is null);