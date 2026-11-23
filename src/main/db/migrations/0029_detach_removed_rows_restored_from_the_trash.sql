-- A removed task or project is in the trash: sync puts it there when its provider removes it, and
-- Restore now turns its link detached. Restore used to clear archived_at and leave the link removed,
-- which left the item out of the trash, editable, and still overwritten by sync if the item came
-- back. Detach those, as Restore does now: they are the user's copies, and Reattach hands them back.
-- Removed events have no trash (they are hidden, kept for what links to them) and are left as
-- they are.
UPDATE `external_links`
SET `state` = 'detached', `removed_at` = NULL
WHERE `state` = 'removed'
  AND (
    `task_id` IN (SELECT `id` FROM `tasks` WHERE `archived_at` IS NULL)
    OR `project_id` IN (SELECT `id` FROM `projects` WHERE `archived_at` IS NULL)
  );
