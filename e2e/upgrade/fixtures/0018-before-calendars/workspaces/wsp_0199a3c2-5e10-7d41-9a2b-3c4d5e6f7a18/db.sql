-- A workspace as DevBrain wrote it at migration 0018 (2026-10-09). Times are Unix milliseconds,
-- dates their UTC midnight, as that version stored them.

-- projects: one active, one in the trash
INSERT INTO projects (id, title, description, start_date, due_date, color, status, created_at, updated_at, archived_at) VALUES
  ('prj_0199a3c2-6000-7a01-8a01-000000000001', 'Website relaunch', 'The new marketing site.', 1790812800000, 1796083200000, '#6366f1', 3, 1790812800000, 1791547200000, NULL),
  ('prj_0199a3c2-6000-7a01-8a01-000000000002', 'Old experiments', NULL, NULL, NULL, '#64748b', 1, 1790812800000, 1791547200000, 1791547200000);

-- events: a one-off meeting, an all-day event, a weekly series (its rule as that version stored
-- it: FREQ=… without RRULE:) and a meeting synced from Google Calendar
INSERT INTO events (id, title, description, start_at, end_at, all_day, location, reccurrence_rule, meeting_url, color, created_at, updated_at) VALUES
  ('evt_0199a3c2-6000-7a01-8e01-000000000001', 'Design review', 'Walk through the new navigation.', 1791468000000, 1791471600000, 0, 'Room 4', NULL, NULL, '#22c55e', 1790812800000, 1790812800000),
  ('evt_0199a3c2-6000-7a01-8e01-000000000002', 'Company offsite', NULL, 1792022400000, 1792108800000, 1, NULL, NULL, NULL, NULL, 1790812800000, 1790812800000),
  ('evt_0199a3c2-6000-7a01-8e01-000000000003', 'Weekly sync', 'Plans for the week.', 1791212400000, 1791214200000, 0, NULL, 'FREQ=WEEKLY;BYDAY=MO', 'https://meet.example.com/weekly', '#a855f7', 1790812800000, 1790812800000),
  ('evt_0199a3c2-6000-7a01-8e01-000000000004', 'Customer call', NULL, 1791561600000, 1791563400000, 0, NULL, NULL, 'https://meet.google.com/abc-defg-hij', NULL, 1790812800000, 1791547200000);

-- notes: one in the project, one on the meeting, one in the trash (their files are in notes/)
INSERT INTO notes (id, title, file_path, preview, project_id, linked_event_id, linked_task_id, created_at, updated_at, archived_at) VALUES
  ('nte_0199a3c2-6000-7a01-8b01-000000000001', 'Launch checklist', '${DEVBRAIN}/workspaces/wsp_0199a3c2-5e10-7d41-9a2b-3c4d5e6f7a18/notes/nte_0199a3c2-6000-7a01-8b01-000000000001.md', 'Update the pricing page Email the beta list', 'prj_0199a3c2-6000-7a01-8a01-000000000001', NULL, NULL, 1790812800000, 1791547200000, NULL),
  ('nte_0199a3c2-6000-7a01-8b01-000000000002', 'Design review notes', '${DEVBRAIN}/workspaces/wsp_0199a3c2-5e10-7d41-9a2b-3c4d5e6f7a18/notes/nte_0199a3c2-6000-7a01-8b01-000000000002.md', 'Agreed on the new navigation.', NULL, 'evt_0199a3c2-6000-7a01-8e01-000000000001', NULL, 1791471600000, 1791471600000, NULL),
  ('nte_0199a3c2-6000-7a01-8b01-000000000003', 'Scratch', '${DEVBRAIN}/workspaces/wsp_0199a3c2-5e10-7d41-9a2b-3c4d5e6f7a18/notes/nte_0199a3c2-6000-7a01-8b01-000000000003.md', 'Nothing worth keeping.', NULL, NULL, NULL, 1790812800000, 1791547200000, 1791547200000);

-- tasks: a project task with a subtask, a completed one, one in the trash, and one synced from
-- Linear (below)
INSERT INTO tasks (id, title, description, priority, status, start_date, due_date, parent_task_id, project_id, linked_event_id, linked_note_id, pull_request_url, created_at, updated_at, favorited_at, completed_at, archived_at) VALUES
  ('tsk_0199a3c2-6000-7a01-8c01-000000000001', 'Plan the launch', 'Dates, owners and the **checklist**.', 3, 2, NULL, 1796083200000, NULL, 'prj_0199a3c2-6000-7a01-8a01-000000000001', NULL, 'nte_0199a3c2-6000-7a01-8b01-000000000001', NULL, 1790812800000, 1791547200000, 1791547200000, NULL, NULL),
  ('tsk_0199a3c2-6000-7a01-8c01-000000000002', 'Write the homepage copy', NULL, 2, 1, NULL, 1792454400000, 'tsk_0199a3c2-6000-7a01-8c01-000000000001', 'prj_0199a3c2-6000-7a01-8a01-000000000001', NULL, NULL, NULL, 1790812800000, 1790812800000, NULL, NULL, NULL),
  ('tsk_0199a3c2-6000-7a01-8c01-000000000003', 'Book the venue', NULL, 1, 3, NULL, 1792022400000, NULL, NULL, 'evt_0199a3c2-6000-7a01-8e01-000000000002', NULL, NULL, 1790812800000, 1791547200000, NULL, 1791547200000, NULL),
  ('tsk_0199a3c2-6000-7a01-8c01-000000000004', 'Try a dark logo', NULL, 1, 1, NULL, NULL, NULL, 'prj_0199a3c2-6000-7a01-8a01-000000000002', NULL, NULL, NULL, 1790812800000, 1791547200000, NULL, NULL, 1791547200000),
  ('tsk_0199a3c2-6000-7a01-8c01-000000000005', 'Fix the login redirect', 'Users land on a blank page after signing in.', 3, 2, NULL, 1792454400000, NULL, NULL, NULL, NULL, 'https://github.com/acme/web/pull/42', 1790812800000, 1791547200000, NULL, NULL, NULL);

-- integrations: Linear and Google Calendar, both waiting for sign-in so the test never syncs
INSERT INTO integrations (id, provider, auth_type, account_id, account_label, status, credentials, scopes, created_at, updated_at) VALUES
  ('int_0199a3c2-6000-7a01-8d01-000000000001', 'linear', 'api_key', 'user-1', 'ada@example.com', 'needs_reauth', X'00', NULL, 1790812800000, 1791547200000),
  ('int_0199a3c2-6000-7a01-8d01-000000000002', 'google_calendar', 'oauth', 'ada@example.com', 'ada@example.com', 'needs_reauth', X'00', 'https://www.googleapis.com/auth/calendar.readonly', 1790812800000, 1791547200000);

INSERT INTO external_sources (id, integration_id, source_type, enabled, config, cursor, initial_sync_completed_at, last_synced_at, last_reconciled_at, last_error, consecutive_failures) VALUES
  ('src_0199a3c2-6000-7a01-8d02-000000000001', 'int_0199a3c2-6000-7a01-8d01-000000000001', 'tasks', 1, '{}', NULL, 1790816400000, 1791547200000, 1791547200000, NULL, 0),
  ('src_0199a3c2-6000-7a01-8d02-000000000002', 'int_0199a3c2-6000-7a01-8d01-000000000002', 'events', 1, '{"calendarId":"primary"}', NULL, 1790816400000, 1791547200000, 1791547200000, NULL, 0);

INSERT INTO external_links (id, source_id, provider, task_id, project_id, event_id, external_id, external_key, external_url, external_updated_at, state, metadata, last_synced_at) VALUES
  ('xln_0199a3c2-6000-7a01-8d03-000000000001', 'src_0199a3c2-6000-7a01-8d02-000000000001', 'linear', 'tsk_0199a3c2-6000-7a01-8c01-000000000005', NULL, NULL, 'issue-42', 'ENG-42', 'https://linear.app/acme/issue/ENG-42', 1791547200000, 'synced', '{"statusLabel":"In Progress","priorityLabel":"Urgent"}', 1791547200000),
  ('xln_0199a3c2-6000-7a01-8d03-000000000002', 'src_0199a3c2-6000-7a01-8d02-000000000002', 'google_calendar', NULL, NULL, 'evt_0199a3c2-6000-7a01-8e01-000000000004', 'gcal-event-1', NULL, 'https://www.google.com/calendar/event?eid=Z2NhbC1ldmVudC0x', 1791547200000, 'synced', '{}', 1791547200000);

-- the search index, as that version kept it (core's SearchService writes it, not triggers)
INSERT INTO search_index (title, body, entity_id, entity_type) VALUES
  ('Website relaunch', 'The new marketing site.', 'prj_0199a3c2-6000-7a01-8a01-000000000001', 'project'),
  ('Plan the launch', 'Dates, owners and the **checklist**.', 'tsk_0199a3c2-6000-7a01-8c01-000000000001', 'task'),
  ('Write the homepage copy', '', 'tsk_0199a3c2-6000-7a01-8c01-000000000002', 'task'),
  ('Book the venue', '', 'tsk_0199a3c2-6000-7a01-8c01-000000000003', 'task'),
  ('Fix the login redirect', 'Users land on a blank page after signing in.', 'tsk_0199a3c2-6000-7a01-8c01-000000000005', 'task'),
  ('Launch checklist', '- Update the pricing page
- Email the beta list
', 'nte_0199a3c2-6000-7a01-8b01-000000000001', 'note'),
  ('Design review notes', 'Agreed on the new navigation.
', 'nte_0199a3c2-6000-7a01-8b01-000000000002', 'note'),
  ('Design review', 'Walk through the new navigation.', 'evt_0199a3c2-6000-7a01-8e01-000000000001', 'event'),
  ('Company offsite', '', 'evt_0199a3c2-6000-7a01-8e01-000000000002', 'event'),
  ('Weekly sync', 'Plans for the week.', 'evt_0199a3c2-6000-7a01-8e01-000000000003', 'event'),
  ('Customer call', '', 'evt_0199a3c2-6000-7a01-8e01-000000000004', 'event');
