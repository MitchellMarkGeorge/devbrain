import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// tasks.delete, projects.delete and notes.delete end to end, through the transport, over a real
// DevBrain folder. Only an archived (trashed) item can be deleted. Each mutation's `changed` names
// what was removed and what lost a link to it.

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

describe('tasks.delete', () => {
  it('deletes a task with its subtasks, returning every id, and unlinks its task note', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    const sub = workspace().tasks.createSubtask(task.id, { title: 'Part' });
    const note = await workspace().notes.createNote({ title: 'Notes', linkedTaskId: task.id });
    workspace().archive.archiveTask(task.id);

    expect(await mutate('tasks.delete', { id: task.id })).toMatchObject({
      ok: true,
      data: { taskIds: [task.id, sub.id], unlinkedNoteIds: [note.id] },
      changed: ['task', 'note'],
    });
    // only the note is left in the trash
    expect(
      workspace()
        .archive.listArchived()
        .items.map((item) => item.id),
    ).toEqual([note.id]);
  });

  it('refuses an active task with not_archived, reporting no change', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });

    const result = await mutate('tasks.delete', { id: task.id });

    expect(code(result)).toBe('not_archived');
    expect(result.changed).toEqual([]);
    expect(workspace().tasks.getById(task.id)).toBeDefined();
  });

  it('fails with not_found and invalid_input', async () => {
    expect(code(await mutate('tasks.delete', { id: 'tsk_missing' }))).toBe('not_found');
    expect(code(await mutate('tasks.delete', { id: 'prj_1' }))).toBe('invalid_input');
  });
});

describe('projects.delete', () => {
  it('deletes a project, keeping its tasks and notes without it', async () => {
    const project = workspace().projects.createProject({ title: 'App', dueDate: DUE });
    const task = workspace().tasks.createTask({ title: 'In', dueDate: DUE, projectId: project.id });
    const note = await workspace().notes.createNote({ title: 'Plan', projectId: project.id });
    expect(code(await mutate('projects.delete', { id: project.id }))).toBe('not_archived');
    workspace().archive.archiveProject(project.id);

    const result = await mutate('projects.delete', { id: project.id });

    expect(result).toMatchObject({
      ok: true,
      data: { projectId: project.id, unfiledTaskIds: [task.id], unfiledNoteIds: [note.id] },
    });
    expect([...result.changed].sort()).toEqual(['note', 'project', 'task']);
    expect(workspace().archive.restoreTask(task.id).projectId).toBeNull();
    expect(code(await mutate('projects.delete', { id: project.id }))).toBe('not_found');
  });
});

describe('notes.delete', () => {
  it('deletes a note and its file, unlinking tasks made from it', async () => {
    const note = await workspace().notes.createNote({ title: 'Spec' });
    const task = workspace().tasks.createTask({
      title: 'From spec',
      dueDate: DUE,
      linkedNoteId: note.id,
    });
    expect(code(await mutate('notes.delete', { id: note.id }))).toBe('not_archived');
    workspace().archive.archiveNote(note.id);

    expect(await mutate('notes.delete', { id: note.id })).toMatchObject({
      ok: true,
      data: { noteId: note.id, unlinkedTaskIds: [task.id], fileRemoved: true },
      changed: ['note', 'task'],
    });
    expect(code(await mutate('notes.delete', { id: note.id }))).toBe('not_found');
  });
});
