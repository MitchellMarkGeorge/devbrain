CREATE TABLE `deleted_external_tasks` (
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `external_id`)
);
