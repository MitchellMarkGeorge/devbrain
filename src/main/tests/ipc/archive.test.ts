import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { TaskStatus, type ArchivedEntity, type Page } from '@common/types';
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
  it('previews what moving a task to the trash takes along, changing nothing', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    const subtask = workspace().tasks.createSubtask(task.id, { title: 'Tag it', dueDate: DUE });
    const note = await workspace().notes.createNote({ title: 'Ship notes', linkedTaskId: task.id });

    const input = { taskIds: [task.id], projectIds: [], noteIds: [] };
    expect(await call('archive.previewArchive', input)).toMatchObject({
      ok: true,
      data: {
        tasks: [{ id: subtask.id, title: 'Tag it', status: TaskStatus.NOT_STARTED }],
        notes: [{ id: note.id, title: 'Ship notes' }],
      },
    });
    expect(await archived()).toEqual([]);
    expect(code(await call('archive.previewArchive', { ...input, taskIds: ['nope'] }))).toBe(
      'invalid_input',
    );
  });

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
    await mutate('archive.archiveProject', { id: project.id });

    const result = await call<Page<ArchivedEntity>>('archive.listArchived', {});
    if (!result.ok) throw new Error('listArchived failed');
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
    await mutate('archive.archiveProject', { id: project.id });
    await mutate('archive.archiveNote', { id: note.id });

    expect(await call('projects.get', { id: project.id })).toMatchObject({
      ok: true,
      data: { id: project.id, archivedAt: expect.any(Date) },
    });
    expect(await call('notes.get', { id: note.id })).toMatchObject({
      ok: true,
      data: { id: note.id, archivedAt: expect.any(Date) },
    });
    expect(await call('notes.readContent', { id: note.id })).toMatchObject({
      ok: true,
      data: expect.stringContaining('Kept body'),
    });
    // its content can't be saved until it is restored
    expect(code(await mutate('notes.updateContent', { id: note.id, content: 'x' }))).toBe(
      'already_archived',
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
    await mutate('archive.archiveProject', { id: project.id });
    await mutate('archive.archiveNote', { id: note.id });

    const result = await mutate('archive.restoreMany', {
      projectIds: [project.id],
      taskIds: [task.id],
      noteIds: [note.id],
    });
    expect(result).toMatchObject({
      ok: true,
      data: { projectIds: [project.id], taskIds: [task.id], noteIds: [note.id] },
    });
    expect([...result.changed].sort()).toEqual(['note', 'project', 'task']);
    expect(await archived()).toEqual([]);
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
    await mutate('archive.archiveProject', { id: project.id });
    await mutate('archive.archiveNote', { id: note.id });

    const result = await mutate('archive.deleteMany', {
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
    expect(await archived()).toEqual([['tasks', 'Kept']]);
  });

  it('refuses a selection with a row not in the trash, and an empty one, changing nothing', async () => {
    const live = workspace().tasks.createTask({ title: 'Live', dueDate: DUE });
    const note = await workspace().notes.createNote({ title: 'Trashed' });
    await mutate('archive.archiveNote', { id: note.id });
    const both = { taskIds: [live.id], projectIds: [], noteIds: [note.id] };

    for (const path of ['archive.restoreMany', 'archive.deleteMany']) {
      expect(await mutate(path, both)).toMatchObject({
        ok: false,
        error: { data: { code: 'not_archived' } },
        changed: [],
      });
      expect(code(await mutate(path, { taskIds: [], projectIds: [], noteIds: [] }))).toBe(
        'invalid_input',
      );
    }
    expect(await archived()).toEqual([['notes', 'Trashed']]);
  });
});
