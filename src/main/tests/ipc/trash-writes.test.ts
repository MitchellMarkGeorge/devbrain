import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { TaskStatus } from '@common/types';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// Writes to items in the trash, end to end, through the transport, over a real DevBrain folder:
// core refuses them with already_archived, so the read-only rule holds whatever the renderer
// sends. docs/deleting.md, "Writes to items in the trash".

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

const DUE = new Date('2026-12-01T00:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  const tracker = new ChangeTracker(vi.fn());
  tracker.watch(devBrain);
  attachRouter(appRouter, { createContext: testContext(devBrain), changeTracker: tracker });
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

function workspace(): Workspace {
  return devBrain.currentWorkspace!;
}

const mutate = (path: string, input: unknown) => call(path, input, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

describe('projects.update', () => {
  it('refuses a project in the trash with already_archived, reporting no change', async () => {
    const project = workspace().projects.createProject({ title: 'Launch', color: '#ff0000' });
    workspace().archive.archiveProject(project.id);

    const result = await mutate('projects.update', {
      id: project.id,
      title: 'Renamed',
      color: '#00ff00',
      dueDate: DUE,
    });

    expect(result.ok).toBe(false);
    expect(code(result)).toBe('already_archived');
    expect(result.changed).toEqual([]);
    workspace().archive.restoreProject(project.id);
    expect(workspace().projects.getById(project.id)).toMatchObject({
      title: 'Launch',
      color: '#ff0000',
      dueDate: null,
    });
  });

  it('updates the project again once it is restored', async () => {
    const project = workspace().projects.createProject({ title: 'Launch' });
    workspace().archive.archiveProject(project.id);
    workspace().archive.restoreProject(project.id);

    expect(await mutate('projects.update', { id: project.id, title: 'Renamed' })).toMatchObject({
      ok: true,
      data: { title: 'Renamed' },
      changed: ['project'],
    });
  });
});

describe('tasks.update', () => {
  it('refuses a task in the trash with already_archived, reporting no change', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship' });
    workspace().archive.archiveTask(task.id);

    const result = await mutate('tasks.update', { id: task.id, title: 'Renamed', dueDate: DUE });

    expect(result.ok).toBe(false);
    expect(code(result)).toBe('already_archived');
    expect(result.changed).toEqual([]);
    expect(workspace().tasks.getById(task.id, { includeArchived: true })).toMatchObject({
      title: 'Ship',
      dueDate: null,
    });
  });

  it('refuses the status and favourite routes the same way', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship' });
    workspace().archive.archiveTask(task.id);

    const status = await mutate('tasks.updateStatus', {
      id: task.id,
      status: TaskStatus.COMPLETED,
    });
    const favorite = await mutate('tasks.setFavorite', { id: task.id, favorite: true });

    expect(code(status)).toBe('already_archived');
    expect(code(favorite)).toBe('already_archived');
    expect(workspace().tasks.getById(task.id, { includeArchived: true })).toMatchObject({
      status: TaskStatus.NOT_STARTED,
      favoritedAt: null,
    });
  });

  it('still answers not_found for an unknown task', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship' });
    workspace().archive.archiveTask(task.id);
    await mutate('tasks.delete', { id: task.id });

    expect(code(await mutate('tasks.update', { id: task.id, title: 'Renamed' }))).toBe('not_found');
  });
});
