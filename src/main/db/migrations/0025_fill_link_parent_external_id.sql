-- Data only; the column and its index are added in 0024.
-- Each link's parent_external_id is the id its metadata already records: a task link's parent
-- issue, an event link's series master. A JSON null, or no key at all, leaves it null.
UPDATE `external_links` SET "parent_external_id" = json_extract("metadata", '$.parentExternalId')
WHERE "task_id" IS NOT NULL;--> statement-breakpoint
UPDATE `external_links` SET "parent_external_id" = json_extract("metadata", '$.recurringEventExternalId')
WHERE "event_id" IS NOT NULL;
