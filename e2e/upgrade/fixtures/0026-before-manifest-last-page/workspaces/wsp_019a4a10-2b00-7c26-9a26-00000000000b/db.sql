-- The second workspace, last opened before the first: a project and its tasks.
INSERT INTO projects (id, title, description, start_date, due_date, color, status, created_at, updated_at) VALUES
  ('prj_019a4a10-2b00-7c26-8a26-00000000000b', 'Garden planner', 'A small app for planning beds.', NULL, NULL, '#84cc16', 3, 1793577600000, 1793577600000);
INSERT INTO tasks (id, title, priority, status, project_id, created_at, updated_at) VALUES
  ('tsk_019a4a10-2b00-7c26-8f26-00000000000b', 'Sketch the raised beds', 2, 1, 'prj_019a4a10-2b00-7c26-8a26-00000000000b', 1793577600000, 1793577600000);
INSERT INTO search_index (title, body, entity_id, entity_type) VALUES
  ('Garden planner', 'A small app for planning beds.', 'prj_019a4a10-2b00-7c26-8a26-00000000000b', 'project'),
  ('Sketch the raised beds', '', 'tsk_019a4a10-2b00-7c26-8f26-00000000000b', 'task');
