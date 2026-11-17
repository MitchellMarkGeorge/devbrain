import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { TaskStatus, type TrashedEntity, type Page } from '@common/types';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The trash router end to end, through the transport, over a real DevBrain folder. The change
// tracker fills each mutation's `changed` with what the trash cascaded to.

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

// what listTrashed returns, as [entityType, title] pairs
async function trashed(input: object = {}) {
  const result = await call<Page<TrashedEntity>>('trash.listTrashed', input);
  if (!result.ok) throw new Error(`call failed: ${JSON.stringify(result.error)}`);
  return result.data.items.map(({ entityType, title }) => [entityType, title]);
}

describe('trash', () => {
  it('trashes a task with its linked note, returning both in changed, and restores them', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    await workspace().notes.createNote({ title: 'Ship notes', linkedTaskId: task.id });

    expect(await mutate('trash.trashTask', { id: task.id })).toMatchObject({
      ok: true,
      data: { id: task.id, trashedAt: expect.any(Date) },
      changed: ['task', 'note'],
    });
    expect((await trashed()).sort()).toEqual([
      ['notes', 'Ship notes'],
      ['tasks', 'Ship'],
    ]);
    expect(await trashed({ entityType: 'tasks' })).toEqual([['tasks', 'Ship']]);

    expect(await mutate('trash.restoreTask', { id: task.id })).toMatchObject({
      ok: true,
      data: { id: task.id, trashedAt: null },
      changed: ['task', 'note'],
    });
    expect(await trashed()).toEqual([]);
  });

  it('trashes a project with its tasks, and restores them', async () => {
    const project = workspace().projects.createProject({ title: 'App', dueDate: DUE });
    workspace().tasks.createTask({ title: 'In the app', dueDate: DUE, projectId: project.id });

    const result = await mutate('trash.trashProject', { id: project.id });
    expect(result).toMatchObject({ ok: true, data: { id: project.id } });
    expect([...result.changed].sort()).toEqual(['project', 'task']);
    expect(workspace().tasks.listTasks().items).toEqual([]);

    const restored = await mutate('trash.restoreProject', { id: project.id });
    expect(restored).toMatchObject({ ok: true, data: { id: project.id, trashedAt: null } });
    expect([...restored.changed].sort()).toEqual(['project', 'task']);
    expect(workspace().tasks.listTasks().items).toHaveLength(1);
  });

  it('trashes and restores a note on its own', async () => {
    const note = await workspace().notes.createNote({ title: 'Loose' });

    expect(await mutate('trash.trashNote', { id: note.id })).toMatchObject({
      ok: true,
      data: { id: note.id },
      changed: ['note'],
    });
    expect(await trashed({ entityType: 'notes', limit: 10 })).toEqual([['notes', 'Loose']]);
    expect(await mutate('trash.restoreNote', { id: note.id })).toMatchObject({
      ok: true,
      data: { trashedAt: null },
      changed: ['note'],
    });
  });

  it("passes core's errors through, with nothing changed", async () => {
    const task = workspace().tasks.createTask({ title: 'Once', dueDate: DUE });
    await mutate('trash.trashTask', { id: task.id });

    expect(await mutate('trash.trashTask', { id: task.id })).toMatchObject({
      ok: false,
      error: { data: { code: 'already_in_trash' } },
      changed: [],
    });
    const note = await workspace().notes.createNote({ title: 'Live' });
    expect(code(await mutate('trash.restoreNote', { id: note.id }))).toBe('not_in_trash');
    expect(code(await mutate('trash.trashProject', { id: 'prj_missing' }))).toBe('not_found');
  });

  it('refuses an id of another entity and an unknown entity type', async () => {
    const task = workspace().tasks.createTask({ title: 'Task', dueDate: DUE });

    expect(code(await mutate('trash.trashNote', { id: task.id }))).toBe('invalid_input');
    expect(code(await call('trash.listTrashed', { entityType: 'events' }))).toBe('invalid_input');
  });

  it('lists what each row draws: a task’s status and project, a project’s colour, a note’s preview', async () => {
    const project = workspace().projects.createProject({ title: 'Gateway', color: '#f59e0b' });
    const task = workspace().tasks.createTask({
      title: 'Set up',
      dueDate: DUE,
      projectId: project.id,
      status: TaskStatus.COMPLETED,
    });
    const note = await workspace().notes.createNote({
      title: 'Plan',
      projectId: project.id,
      content: 'First line of the plan.',
    });
    await mutate('trash.trashProject', { id: project.id });

    const result = await call<Page<TrashedEntity>>('trash.listTrashed', {});
    if (!result.ok) throw new Error('listTrashed failed');
    const rows = new Map(result.data.items.map((item) => [item.id as string, item]));
    const summary = { id: project.id, title: 'Gateway', color: '#f59e0b' };
    expect(rows.get(project.id)).toMatchObject({
      entityType: 'projects',
      color: '#f59e0b',
      status: project.status,
      external: null,
    });
    expect(rows.get(task.id)).toMatchObject({
      entityType: 'tasks',
      status: TaskStatus.COMPLETED,
      project: summary,
      external: null,
    });
    expect(rows.get(note.id)).toMatchObject({
      entityType: 'notes',
      preview: expect.stringContaining('First line of the plan.'),
      project: summary,
    });
  });

  it('gets a trashed project and note, and the note’s markdown, for their read-only pages', async () => {
    const project = workspace().projects.createProject({ title: 'Gone' });
    const note = await workspace().notes.createNote({ title: 'Gone too', content: 'Kept body' });
    await mutate('trash.trashProject', { id: project.id });
    await mutate('trash.trashNote', { id: note.id });

    expect(await call('projects.get', { id: project.id })).toMatchObject({
      ok: true,
      data: { id: project.id, trashedAt: expect.any(Date) },
    });
    expect(await call('notes.get', { id: note.id })).toMatchObject({
      ok: true,
      data: { id: note.id, trashedAt: expect.any(Date) },
    });
    expect(await call('notes.readContent', { id: note.id })).toMatchObject({
      ok: true,
      data: expect.stringContaining('Kept body'),
    });
    // its content can't be saved until it is restored
    expect(code(await mutate('notes.updateContent', { id: note.id, content: 'x' }))).toBe(
      'not_found',
    );
    expect(code(await call('projects.get', { id: 'prj_missing' }))).toBe('not_found');
  });

  it('restores several rows at once, a task its chosen project brings back counted once', async () => {
    const project = workspace().projects.createProject({ title: 'Gateway' });
    const task = workspace().tasks.createTask({
      title: 'In it',
      dueDate: DUE,
      projectId: project.id,
    });
    const note = await workspace().notes.createNote({ title: 'Loose' });
    await mutate('trash.trashProject', { id: project.id });
    await mutate('trash.trashNote', { id: note.id });

    const result = await mutate('trash.restoreMany', {
      projectIds: [project.id],
      taskIds: [task.id],
      noteIds: [note.id],
    });
    expect(result).toMatchObject({
      ok: true,
      data: { projectIds: [project.id], taskIds: [task.id], noteIds: [note.id] },
    });
    expect([...result.changed].sort()).toEqual(['note', 'project', 'task']);
    expect(await trashed()).toEqual([]);
  });

  it('deletes several rows at once for good, with what lost a link to them', async () => {
    const project = workspace().projects.createProject({ title: 'Gateway' });
    // stays in the trash, without its project
    workspace().tasks.createTask({
      title: 'Kept',
      dueDate: DUE,
      projectId: project.id,
    });
    const note = await workspace().notes.createNote({ title: 'Loose' });
    await mutate('trash.trashProject', { id: project.id });
    await mutate('trash.trashNote', { id: note.id });

    const result = await mutate('trash.deleteMany', {
      projectIds: [project.id],
      taskIds: [],
      noteIds: [note.id],
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        projectIds: [project.id],
        noteIds: [note.id],
        taskIds: [],
        keptTaskIds: [],
        filesNotRemoved: [],
      },
    });
    // the task left the project, and stays in the trash
    expect([...result.changed].sort()).toEqual(['note', 'project', 'task']);
    expect(await trashed()).toEqual([['tasks', 'Kept']]);
  });

  it('refuses a selection with a row not in the trash, and an empty one, changing nothing', async () => {
    const live = workspace().tasks.createTask({ title: 'Live', dueDate: DUE });
    const note = await workspace().notes.createNote({ title: 'Trashed' });
    await mutate('trash.trashNote', { id: note.id });
    const both = { taskIds: [live.id], projectIds: [], noteIds: [note.id] };

    for (const path of ['trash.restoreMany', 'trash.deleteMany']) {
      expect(await mutate(path, both)).toMatchObject({
        ok: false,
        error: { data: { code: 'not_in_trash' } },
        changed: [],
      });
      expect(code(await mutate(path, { taskIds: [], projectIds: [], noteIds: [] }))).toBe(
        'invalid_input',
      );
    }
    expect(await trashed()).toEqual([['notes', 'Trashed']]);
  });
});
