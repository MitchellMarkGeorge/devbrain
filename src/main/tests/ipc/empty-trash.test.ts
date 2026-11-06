import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// archive.emptyTrash end to end, through the transport and a real ChangeTracker, over a real
// DevBrain folder: every archived task, project and note goes for good, and `changed` names each
// kind removed and each kind that lost a link.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

const DUE = new Date('2026-11-02T00:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  const tracker = new ChangeTracker(vi.fn());
  tracker.watch(devBrain);
  attachRouter(appRouter, { createContext: testContext(devBrain), changeTracker: tracker });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

const open = async (): Promise<Workspace> =>
  devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));

const emptyTrash = () => call('archive.emptyTrash', undefined, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

describe('archive.emptyTrash', () => {
  it('deletes every archived item and its files, returning the ids removed', async () => {
    const workspace = await open();
    const project = workspace.projects.createProject({ title: 'Old', dueDate: DUE });
    const task = workspace.tasks.createTask({ title: 'Old', dueDate: DUE });
    const sub = workspace.tasks.createSubtask(task.id, { title: 'Part' });
    const note = await workspace.notes.createNote({ title: 'Old' });
    const filed = workspace.tasks.createTask({
      title: 'Filed',
      dueDate: DUE,
      projectId: project.id,
    });
    workspace.archive.archiveProject(project.id);
    workspace.archive.restoreTask(filed.id);
    workspace.archive.archiveTask(task.id);
    workspace.archive.archiveNote(note.id);

    const result = await emptyTrash();

    expect(result).toMatchObject({
      ok: true,
      data: {
        taskIds: expect.arrayContaining([task.id, sub.id]),
        projectIds: [project.id],
        noteIds: [note.id],
        keptTaskIds: [],
        filesNotRemoved: [],
      },
    });
    // the project's task lost its project: `task` is named by the tasks' and the project's changes
    expect([...result.changed].sort()).toEqual(['note', 'project', 'task']);
    expect(workspace.archive.listArchived().items).toEqual([]);
    expect(workspace.tasks.getById(filed.id).projectId).toBeNull();
    expect(await fs.readdir(path.join(workspace.info.path, 'notes'))).toEqual([]);
  });

  it('names only the kinds it removed, and nothing for an empty trash', async () => {
    const workspace = await open();
    const note = await workspace.notes.createNote({ title: 'Old' });
    workspace.archive.archiveNote(note.id);

    expect(await emptyTrash()).toMatchObject({ ok: true, changed: ['note'] });
    expect(await emptyTrash()).toEqual({
      ok: true,
      data: { taskIds: [], projectIds: [], noteIds: [], keptTaskIds: [], filesNotRemoved: [] },
      changed: [],
    });
  });

  it('needs an open workspace', async () => {
    expect(code(await emptyTrash())).toBe('no_workspace_open');
  });
});
