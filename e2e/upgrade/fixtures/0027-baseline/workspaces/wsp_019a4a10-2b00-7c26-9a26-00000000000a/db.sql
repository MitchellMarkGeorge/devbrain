-- The Work workspace, as main (b0bb3767, migration 0027) writes it: calendars and the event
-- model, Linear and Google Calendar connected (now waiting for sign-in, so the test never syncs).
-- Migration 0020 made the default calendar, cal_default.

INSERT INTO integrations (id, provider, auth_type, account_id, account_label, status, credentials, scopes, created_at, updated_at) VALUES
  ('int_019a4a10-2b00-7c26-8d26-000000000001', 'linear', 'api_key', 'user-7', 'ada@acme.dev', 'needs_reauth', X'00', NULL, 1790812800000, 1793880000000),
  ('int_019a4a10-2b00-7c26-8d26-000000000002', 'google_calendar', 'oauth', 'ada@acme.dev', 'ada@acme.dev', 'needs_reauth', X'00', 'https://www.googleapis.com/auth/calendar.events', 1790812800000, 1793880000000);

INSERT INTO external_sources (id, integration_id, source_type, enabled, config, cursor, initial_sync_completed_at, last_synced_at, last_reconciled_at, last_error, consecutive_failures, retry_at) VALUES
  ('src_019a4a10-2b00-7c26-8d27-000000000001', 'int_019a4a10-2b00-7c26-8d26-000000000001', 'tasks', 1, '{}', NULL, 1790816400000, 1793880000000, 1793880000000, NULL, 0, NULL),
  ('src_019a4a10-2b00-7c26-8d27-000000000002', 'int_019a4a10-2b00-7c26-8d26-000000000002', 'events', 1, '{}', NULL, 1790816400000, 1793880000000, 1793880000000, NULL, 0, NULL);

INSERT INTO calendars (id, source_id, external_id, name, color, time_zone, is_primary, selected, visible, created_at, updated_at, history_loaded_from) VALUES
  ('cal_019a4a10-2b00-7c26-8c26-000000000001', 'src_019a4a10-2b00-7c26-8d27-000000000002', 'ada@acme.dev', 'ada@acme.dev', '#039be5', 'America/Toronto', 1, 1, 1, 1790816400000, 1793880000000, 1785542400000);

-- projects: one synced from Linear, one local
INSERT INTO projects (id, title, description, start_date, due_date, color, status, created_at, updated_at, archived_at) VALUES
  ('prj_019a4a10-2b00-7c26-8a26-000000000001', 'Billing v2', 'Usage-based billing.', 1793577600000, 1795996800000, '#f97316', 3, 1790816400000, 1793880000000, NULL),
  ('prj_019a4a10-2b00-7c26-8a26-000000000002', 'Hiring', NULL, NULL, NULL, '#14b8a6', 1, 1790812800000, 1790812800000, NULL);

-- events: a weekly series from Google, one occurrence cancelled and one moved; a local weekly
-- series; a one-off
INSERT INTO events (id, calendar_id, title, description, start_at, end_at, all_day, start_date, end_date, time_zone, location, recurrence_rule, series_id, original_start_at, status, response, kind, meeting_url, color, created_at, updated_at) VALUES
  ('evt_019a4a10-2b00-7c26-8e26-000000000001', 'cal_019a4a10-2b00-7c26-8c26-000000000001', 'Team standup', NULL, 1793714400000, 1793715300000, 0, NULL, NULL, 'America/Toronto', NULL, 'RRULE:FREQ=WEEKLY;BYDAY=TU', NULL, NULL, 'confirmed', 'accepted', 'default', 'https://meet.google.com/abc-defg-hij', NULL, 1790816400000, 1793880000000),
  ('evt_019a4a10-2b00-7c26-8e26-000000000002', 'cal_019a4a10-2b00-7c26-8c26-000000000001', 'Team standup', 'Moved for the all-hands.', 1794927600000, 1794928500000, 0, NULL, NULL, 'America/Toronto', NULL, NULL, 'evt_019a4a10-2b00-7c26-8e26-000000000001', 1794924000000, 'confirmed', 'accepted', 'default', 'https://meet.google.com/abc-defg-hij', NULL, 1793880000000, 1793880000000),
  ('evt_019a4a10-2b00-7c26-8e26-000000000003', 'cal_default', 'Gym', NULL, 1793815200000, 1793818800000, 0, NULL, NULL, NULL, NULL, 'RRULE:FREQ=WEEKLY;BYDAY=WE', NULL, NULL, 'confirmed', NULL, 'default', NULL, '#22c55e', 1790812800000, 1790812800000),
  ('evt_019a4a10-2b00-7c26-8e26-000000000004', 'cal_default', 'Quarterly planning', NULL, 1795564800000, 1795651200000, 1, '2026-11-25', '2026-11-26', NULL, NULL, NULL, NULL, NULL, 'confirmed', NULL, 'default', NULL, NULL, 1790812800000, 1790812800000);

INSERT INTO event_exceptions (series_id, original_start_at) VALUES
  ('evt_019a4a10-2b00-7c26-8e26-000000000001', 1794319200000);

INSERT INTO notes (id, title, file_path, preview, project_id, linked_event_id, linked_task_id, created_at, updated_at, archived_at, viewed_at) VALUES
  ('nte_019a4a10-2b00-7c26-8b26-000000000001', 'Standup notes', '${DEVBRAIN}/workspaces/wsp_019a4a10-2b00-7c26-9a26-00000000000a/notes/nte_019a4a10-2b00-7c26-8b26-000000000001.md', 'Billing is blocked on the tax API.', 'prj_019a4a10-2b00-7c26-8a26-000000000001', 'evt_019a4a10-2b00-7c26-8e26-000000000001', NULL, 1793714400000, 1793880000000, NULL, 1793880000000),
  ('nte_019a4a10-2b00-7c26-8b26-000000000002', 'Old retro', '${DEVBRAIN}/workspaces/wsp_019a4a10-2b00-7c26-9a26-00000000000a/notes/nte_019a4a10-2b00-7c26-8b26-000000000002.md', 'Moved to the wiki.', NULL, NULL, NULL, 1790812800000, 1793577600000, 1793577600000, NULL);

-- tasks: three synced from Linear (one with Linear's "No priority", stored as NONE, 0; one
-- detached, its priority the user's own), one local, one in the trash
INSERT INTO tasks (id, title, description, priority, status, start_date, due_date, parent_task_id, project_id, linked_event_id, linked_note_id, pull_request_url, created_at, updated_at, favorited_at, completed_at, archived_at, viewed_at) VALUES
  ('tsk_019a4a10-2b00-7c26-8f26-000000000001', 'Triage the support inbox', NULL, 0, 1, NULL, NULL, NULL, 'prj_019a4a10-2b00-7c26-8a26-000000000001', NULL, NULL, NULL, 1790816400000, 1793880000000, NULL, NULL, NULL, NULL),
  ('tsk_019a4a10-2b00-7c26-8f26-000000000002', 'Ship invoices', 'Behind the **billing_v2** flag.', 3, 2, 1793577600000, 1795996800000, NULL, 'prj_019a4a10-2b00-7c26-8a26-000000000001', NULL, NULL, 'https://github.com/acme/api/pull/310', 1790816400000, 1793880000000, 1793880000000, NULL, NULL, 1793880000000),
  ('tsk_019a4a10-2b00-7c26-8f26-000000000003', 'Write the onboarding guide', NULL, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1790816400000, 1793880000000, NULL, NULL, NULL, NULL),
  ('tsk_019a4a10-2b00-7c26-8f26-000000000004', 'Post the job ad', NULL, 2, 3, NULL, 1792454400000, NULL, 'prj_019a4a10-2b00-7c26-8a26-000000000002', NULL, NULL, NULL, 1790812800000, 1792454400000, NULL, 1792454400000, NULL, NULL),
  ('tsk_019a4a10-2b00-7c26-8f26-000000000005', 'Spike on GraphQL', NULL, 1, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 1790812800000, 1793577600000, NULL, NULL, 1793577600000, NULL);

INSERT INTO external_links (id, source_id, provider, task_id, project_id, event_id, external_id, external_key, external_url, external_updated_at, state, metadata, last_synced_at, removed_at, settled_at) VALUES
  ('xln_019a4a10-2b00-7c26-8d28-000000000001', 'src_019a4a10-2b00-7c26-8d27-000000000001', 'linear', 'tsk_019a4a10-2b00-7c26-8f26-000000000001', NULL, NULL, 'issue-101', 'BIL-101', 'https://linear.app/acme/issue/BIL-101', 1793880000000, 'synced', '{"statusLabel":"Todo","priorityLabel":"No priority","parentExternalId":null,"parentKey":null,"parentTitle":null}', 1793880000000, NULL, NULL),
  ('xln_019a4a10-2b00-7c26-8d28-000000000002', 'src_019a4a10-2b00-7c26-8d27-000000000001', 'linear', 'tsk_019a4a10-2b00-7c26-8f26-000000000002', NULL, NULL, 'issue-102', 'BIL-102', 'https://linear.app/acme/issue/BIL-102', 1793880000000, 'synced', '{"statusLabel":"In Progress","priorityLabel":"High","parentExternalId":null,"parentKey":null,"parentTitle":null}', 1793880000000, NULL, NULL),
  ('xln_019a4a10-2b00-7c26-8d28-000000000003', 'src_019a4a10-2b00-7c26-8d27-000000000001', 'linear', 'tsk_019a4a10-2b00-7c26-8f26-000000000003', NULL, NULL, 'issue-103', 'DOC-7', 'https://linear.app/acme/issue/DOC-7', 1793577600000, 'detached', '{"statusLabel":"Backlog","priorityLabel":"No priority","parentExternalId":null,"parentKey":null,"parentTitle":null}', 1793577600000, NULL, NULL),
  ('xln_019a4a10-2b00-7c26-8d28-000000000004', 'src_019a4a10-2b00-7c26-8d27-000000000001', 'linear', NULL, 'prj_019a4a10-2b00-7c26-8a26-000000000001', NULL, 'project-9', NULL, 'https://linear.app/acme/project/billing-v2', 1793880000000, 'synced', '{"statusLabel":"In Progress"}', 1793880000000, NULL, NULL),
  ('xln_019a4a10-2b00-7c26-8d28-000000000005', 'src_019a4a10-2b00-7c26-8d27-000000000002', 'google_calendar', NULL, NULL, 'evt_019a4a10-2b00-7c26-8e26-000000000001', 'gcal-standup', NULL, 'https://www.google.com/calendar/event?eid=Z2NhbC1zdGFuZHVw', 1793880000000, 'synced', '{"calendarId":"ada@acme.dev","recurringEventExternalId":null}', 1793880000000, NULL, NULL),
  ('xln_019a4a10-2b00-7c26-8d28-000000000006', 'src_019a4a10-2b00-7c26-8d27-000000000002', 'google_calendar', NULL, NULL, 'evt_019a4a10-2b00-7c26-8e26-000000000002', 'gcal-standup_20261117T140000Z', NULL, 'https://www.google.com/calendar/event?eid=Z2NhbC1zdGFuZHVwXzE', 1793880000000, 'synced', '{"calendarId":"ada@acme.dev","recurringEventExternalId":"gcal-standup"}', 1793880000000, NULL, NULL);

INSERT INTO search_index (title, body, entity_id, entity_type) VALUES
  ('Billing v2', 'Usage-based billing.', 'prj_019a4a10-2b00-7c26-8a26-000000000001', 'project'),
  ('Hiring', '', 'prj_019a4a10-2b00-7c26-8a26-000000000002', 'project'),
  ('Triage the support inbox', '', 'tsk_019a4a10-2b00-7c26-8f26-000000000001', 'task'),
  ('Ship invoices', 'Behind the **billing_v2** flag.', 'tsk_019a4a10-2b00-7c26-8f26-000000000002', 'task'),
  ('Write the onboarding guide', '', 'tsk_019a4a10-2b00-7c26-8f26-000000000003', 'task'),
  ('Post the job ad', '', 'tsk_019a4a10-2b00-7c26-8f26-000000000004', 'task'),
  ('Standup notes', 'Billing is blocked on the tax API.
', 'nte_019a4a10-2b00-7c26-8b26-000000000001', 'note'),
  ('Team standup', '', 'evt_019a4a10-2b00-7c26-8e26-000000000001', 'event'),
  ('Gym', '', 'evt_019a4a10-2b00-7c26-8e26-000000000003', 'event'),
  ('Quarterly planning', '', 'evt_019a4a10-2b00-7c26-8e26-000000000004', 'event');
