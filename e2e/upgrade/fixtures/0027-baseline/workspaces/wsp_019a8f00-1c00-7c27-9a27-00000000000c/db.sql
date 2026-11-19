-- The Home lab workspace, as main (b0bb3767, migration 0027) writes it. What is in the trash
-- has archived_at set: a project trashed with its two tasks (the same time, as a cascade trash
-- writes it), a lone task, and a note.

INSERT INTO projects (id, title, description, color, status, created_at, updated_at, archived_at) VALUES
  ('prj_019a8f00-1c00-7c27-8a27-000000000001', 'Home server', 'Self-hosting the photo library.', '#6366f1', 3, 1793577600000, 1795046400000, NULL),
  ('prj_019a8f00-1c00-7c27-8a27-000000000002', 'Smart lights', NULL, '#eab308', 2, 1793577600000, 1795046400000, 1795046400000);

INSERT INTO tasks (id, title, description, priority, status, project_id, parent_task_id, created_at, updated_at, completed_at, archived_at) VALUES
  ('tsk_019a8f00-1c00-7c27-8f27-000000000001', 'Order the drives', NULL, 3, 1, 'prj_019a8f00-1c00-7c27-8a27-000000000001', NULL, 1793577600000, 1793577600000, NULL, NULL),
  ('tsk_019a8f00-1c00-7c27-8f27-000000000002', 'Pick a hub', NULL, 2, 1, 'prj_019a8f00-1c00-7c27-8a27-000000000002', NULL, 1793577600000, 1795046400000, NULL, 1795046400000),
  ('tsk_019a8f00-1c00-7c27-8f27-000000000003', 'Wire the hallway', NULL, 1, 1, 'prj_019a8f00-1c00-7c27-8a27-000000000002', NULL, 1793577600000, 1795046400000, NULL, 1795046400000),
  ('tsk_019a8f00-1c00-7c27-8f27-000000000004', 'Try Proxmox', NULL, 1, 1, NULL, NULL, 1793577600000, 1794960000000, NULL, 1794960000000);

INSERT INTO notes (id, title, file_path, preview, project_id, created_at, updated_at, archived_at) VALUES
  ('nte_019a8f00-1c00-7c27-8b27-000000000001', 'NAS shopping list', '${DEVBRAIN}/workspaces/wsp_019a8f00-1c00-7c27-9a27-00000000000c/notes/nte_019a8f00-1c00-7c27-8b27-000000000001.md', 'Four 8TB drives, a UPS.', 'prj_019a8f00-1c00-7c27-8a27-000000000001', 1793577600000, 1795046400000, NULL),
  ('nte_019a8f00-1c00-7c27-8b27-000000000002', 'Router config', '${DEVBRAIN}/workspaces/wsp_019a8f00-1c00-7c27-9a27-00000000000c/notes/nte_019a8f00-1c00-7c27-8b27-000000000002.md', 'VLANs for the cameras.', NULL, 1793577600000, 1794873600000, 1794873600000);

INSERT INTO search_index (title, body, entity_id, entity_type) VALUES
  ('Home server', 'Self-hosting the photo library.', 'prj_019a8f00-1c00-7c27-8a27-000000000001', 'project'),
  ('Smart lights', '', 'prj_019a8f00-1c00-7c27-8a27-000000000002', 'project'),
  ('Order the drives', '', 'tsk_019a8f00-1c00-7c27-8f27-000000000001', 'task'),
  ('Pick a hub', '', 'tsk_019a8f00-1c00-7c27-8f27-000000000002', 'task'),
  ('Wire the hallway', '', 'tsk_019a8f00-1c00-7c27-8f27-000000000003', 'task'),
  ('Try Proxmox', '', 'tsk_019a8f00-1c00-7c27-8f27-000000000004', 'task'),
  ('NAS shopping list', 'Four 8TB drives, a UPS.
', 'nte_019a8f00-1c00-7c27-8b27-000000000001', 'note'),
  ('Router config', 'VLANs for the cameras.
', 'nte_019a8f00-1c00-7c27-8b27-000000000002', 'note');
