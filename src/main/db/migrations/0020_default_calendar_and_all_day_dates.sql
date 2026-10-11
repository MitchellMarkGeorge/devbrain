-- Data only; the schema changes are in 0019 and 0021.
-- The default calendar, which every existing event is in (0019 gave calendar_id that default).
INSERT INTO `calendars`("id", "name") VALUES ('cal_default', 'DevBrain');--> statement-breakpoint
-- An all-day event gets its dates: the local day it starts, and the day after the last local day it
-- touches (an end at midnight touches only the day before).
UPDATE `events` SET
  "start_date" = date("start_at" / 1000, 'unixepoch', 'localtime'),
  "end_date" = date(max("end_at" - 1, "start_at") / 1000, 'unixepoch', 'localtime', '+1 day')
WHERE "all_day" = 1;--> statement-breakpoint
-- Its start_at and end_at become those dates' local midnights.
UPDATE `events` SET
  "start_at" = CAST(strftime('%s', "start_date", 'utc') AS INTEGER) * 1000,
  "end_at" = CAST(strftime('%s', "end_date", 'utc') AS INTEGER) * 1000
WHERE "all_day" = 1;
