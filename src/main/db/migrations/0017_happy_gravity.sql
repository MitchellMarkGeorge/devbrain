CREATE TABLE `external_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`provider` text NOT NULL,
	`task_id` text,
	`project_id` text,
	`event_id` text,
	`external_id` text NOT NULL,
	`external_key` text,
	`external_url` text NOT NULL,
	`external_updated_at` integer NOT NULL,
	`state` text DEFAULT 'synced' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`last_synced_at` integer NOT NULL,
	`removed_at` integer,
	`settled_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `external_sources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "one_entity" CHECK(("external_links"."task_id" IS NOT NULL) + ("external_links"."project_id" IS NOT NULL) + ("external_links"."event_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_links_taskId_unique` ON `external_links` (`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_links_projectId_unique` ON `external_links` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_links_eventId_unique` ON `external_links` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_external_links_source_id_state` ON `external_links` (`source_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_external_links_source_external_id` ON `external_links` (`source_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `external_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`integration_id` text NOT NULL,
	`source_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`cursor` text,
	`initial_sync_completed_at` integer,
	`last_synced_at` integer,
	`last_reconciled_at` integer,
	`last_error` text,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_external_sources_integration_type` ON `external_sources` (`integration_id`,`source_type`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`auth_type` text NOT NULL,
	`account_id` text NOT NULL,
	`account_label` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`credentials` blob NOT NULL,
	`scopes` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integrations_provider_account` ON `integrations` (`provider`,`account_id`);