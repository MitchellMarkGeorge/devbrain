import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import type { ArchivedEntity } from '@main/core/archive/types';
import type { Page } from '@main/core/shared/pagination';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The archive router end to end, through the transport, over a real DevBrain folder. The change
// tracker fills each mutation's `changed` with what the archive cascaded to.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

const DUE = new Date('2026-11-02T00:00:00.000Z');

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

// what listArchived returns, as [entityType, title] pairs
async function archived(input: object = {}) {
  const result = await call<Page<ArchivedEntity>>('archive.listArchived', input);
  if (!result.ok) throw new Error(`call failed: ${JSON.stringify(result.error)}`);
  return result.data.items.map(({ entityType, title }) => [entityType, title]);
}

describe('archive', () => {
  it('archives a task with its linked note, returning both in changed, and restores them', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    await workspace().notes.createNote({ title: 'Ship notes', linkedTaskId: task.id });

    expect(await mutate('archive.archiveTask', { id: task.id })).toMatchObject({
      ok: true,
      data: { id: task.id, archivedAt: expect.any(Date) },
      changed: ['task', 'note'],
    });
    expect((await archived()).sort()).toEqual([
      ['notes', 'Ship notes'],
      ['tasks', 'Ship'],
    ]);
    expect(await archived({ entityType: 'tasks' })).toEqual([['tasks', 'Ship']]);

    expect(await mutate('archive.restoreTask', { id: task.id })).toMatchObject({
      ok: true,
      data: { id: task.id, archivedAt: null },
      changed: ['task', 'note'],
    });
    expect(await archived()).toEqual([]);
  });

  it('archives a project with its tasks, and restores them', async () => {
    const project = workspace().projects.createProject({ title: 'App', dueDate: DUE });
    workspace().tasks.createTask({ title: 'In the app', dueDate: DUE, projectId: project.id });

    const result = await mutate('archive.archiveProject', { id: project.id });
    expect(result).toMatchObject({ ok: true, data: { id: project.id } });
    expect([...result.changed].sort()).toEqual(['project', 'task']);
    expect(workspace().tasks.listTasks().items).toEqual([]);

    const restored = await mutate('archive.restoreProject', { id: project.id });
    expect(restored).toMatchObject({ ok: true, data: { id: project.id, archivedAt: null } });
    expect([...restored.changed].sort()).toEqual(['project', 'task']);
    expect(workspace().tasks.listTasks().items).toHaveLength(1);
  });

  it('archives and restores a note on its own', async () => {
    const note = await workspace().notes.createNote({ title: 'Loose' });

    expect(await mutate('archive.archiveNote', { id: note.id })).toMatchObject({
      ok: true,
      data: { id: note.id },
      changed: ['note'],
    });
    expect(await archived({ entityType: 'notes', limit: 10 })).toEqual([['notes', 'Loose']]);
    expect(await mutate('archive.restoreNote', { id: note.id })).toMatchObject({
      ok: true,
      data: { archivedAt: null },
      changed: ['note'],
    });
  });

  it("passes core's errors through, with nothing changed", async () => {
    const task = workspace().tasks.createTask({ title: 'Once', dueDate: DUE });
    await mutate('archive.archiveTask', { id: task.id });

    expect(await mutate('archive.archiveTask', { id: task.id })).toMatchObject({
      ok: false,
      error: { data: { code: 'already_archived' } },
      changed: [],
    });
    const note = await workspace().notes.createNote({ title: 'Live' });
    expect(code(await mutate('archive.restoreNote', { id: note.id }))).toBe('not_archived');
    expect(code(await mutate('archive.archiveProject', { id: 'prj_missing' }))).toBe('not_found');
  });

  it('refuses an id of another entity and an unknown entity type', async () => {
    const task = workspace().tasks.createTask({ title: 'Task', dueDate: DUE });

    expect(code(await mutate('archive.archiveNote', { id: task.id }))).toBe('invalid_input');
    expect(code(await call('archive.listArchived', { entityType: 'events' }))).toBe(
      'invalid_input',
    );
  });
});
