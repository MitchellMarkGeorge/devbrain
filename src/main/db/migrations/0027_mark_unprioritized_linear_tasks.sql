-- A Linear issue with priority 0 has no priority; sync maps it to Low and now also records
-- `unprioritized` in the link's metadata. Sync only rewrites the metadata of an issue that changed,
-- so mark the links already mirrored, by the label Linear gives priority 0.
UPDATE `external_links`
SET `metadata` = json_set(`metadata`, '$.unprioritized', json('true'))
WHERE `provider` = 'linear'
  AND `task_id` IS NOT NULL
  AND json_valid(`metadata`)
  AND json_extract(`metadata`, '$.priorityLabel') = 'No priority';
