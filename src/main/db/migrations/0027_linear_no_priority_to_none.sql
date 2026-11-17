-- Linear's priority 0 ("No priority") was mapped to Low (1); it now has its own value, NONE (0).
-- Sync only rewrites an issue that changed, so move the tasks already mirrored, found by the label
-- Linear gives priority 0. Only synced links: a detached task is the user's own, and its priority
-- may be one they chose since.
UPDATE `tasks`
SET `priority` = 0
WHERE `priority` = 1
  AND `id` IN (
    SELECT `task_id` FROM `external_links`
    WHERE `provider` = 'linear'
      AND `state` = 'synced'
      AND `task_id` IS NOT NULL
      AND json_valid(`metadata`)
      AND json_extract(`metadata`, '$.priorityLabel') = 'No priority'
  );
