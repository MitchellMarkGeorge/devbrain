-- A synced task sits under a synced parent or none: sync only sets a parent whose link is synced.
-- Sync used to move an issue that left (reassigned away, deleted) to the trash and leave its
-- sub-issues still assigned to you under it. They became top-level only when the issue next
-- changed, and until then the board, which shows top-level tasks, left them out. Restoring such a
-- parent made it a detached task with synced tasks under it. Make them top-level now, as sync does
-- when the parent leaves. Each link keeps its parent's id in its metadata, so if the parent comes
-- back synced, sync puts them under it again.
UPDATE `tasks`
SET `parent_task_id` = NULL
WHERE `parent_task_id` IS NOT NULL
  AND `archived_at` IS NULL
  AND `id` IN (
    SELECT `task_id` FROM `external_links`
    WHERE `state` = 'synced' AND `task_id` IS NOT NULL
  )
  AND `parent_task_id` NOT IN (
    SELECT `task_id` FROM `external_links`
    WHERE `state` = 'synced' AND `task_id` IS NOT NULL
  );
