import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { TaskId } from '@common/ids';
import {
  AuthType,
  type Note,
  type Project,
  Provider,
  type SearchResult,
  SourceType,
  type Task,
} from '@common/types';
import type { DevBrain, Workspace } from '@main/core';
import { externalLinks, externalSources, integrations } from '@main/db/schema/integrations';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// Convert to project, duplicate and copy as Markdown (C1–C3) end to end, through the transport and
// the change tracker, over a real DevBrain folder.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;

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

async function data<T>(...args: Parameters<typeof call>): Promise<T> {
  const result = await call<T>(...args);
  if (!result.ok) throw new Error(`${args[0]} failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

const mutate = <T>(path: string, input: unknown) => call<T>(path, input, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

// a task mirrored from Linear, written as sync writes it
function syncedTask(): TaskId {
  const ws = workspace();
  const db = (ws as unknown as { db: BetterSQLite3Database }).db;
  const { id } = ws.tasks.createTask({ title: 'From Linear' });
  const integrationId = db
    .insert(integrations)
    .values({
      provider: Provider.LINEAR,
      authType: AuthType.API_KEY,
      accountId: 'account',
      accountLabel: 'Ada',
      credentials: Buffer.from('ciphertext'),
    })
    .returning()
    .get().id;
  const sourceId = db
    .insert(externalSources)
    .values({ integrationId, sourceType: SourceType.TASKS })
    .returning()
    .get().id;
  const at = new Date('2026-11-02T00:00:00.000Z');
  db.insert(externalLinks)
    .values({
      sourceId,
      provider: Provider.LINEAR,
      externalId: 'issue-1',
      externalKey: 'ENG-1',
      externalUrl: 'https://linear.app/acme/issue/ENG-1',
      externalUpdatedAt: at,
      lastSyncedAt: at,
      taskId: id,
    })
    .run();
  return id;
}

describe('tasks.convertToProject', () => {
  it('returns the new project, with task, project and note in changed', async () => {
    const ws = workspace();
    const task = ws.tasks.createTask({ title: 'Roadmap overhaul' });
    const subtask = ws.tasks.createSubtask(task.id, { title: 'Draft' });
    await ws.notes.createNote({ title: 'Plan', linkedTaskId: task.id });

    const result = await mutate<Project>('tasks.convertToProject', { id: task.id });
    expect(result).toMatchObject({
      ok: true,
      data: { title: 'Roadmap overhaul', external: null },
      changed: ['task', 'project', 'note'],
    });
    const project = (result as { data: Project }).data;
    expect(await data<Task>('tasks.get', { id: subtask.id })).toMatchObject({
      parentTaskId: null,
      projectId: project.id,
    });
    expect(code(await call('tasks.get', { id: task.id }))).toBe('not_found');

    // search finds the project, not the trashed task
    const found = await data<SearchResult[]>('search.search', { query: 'roadmap' });
    expect(found.map((hit) => hit.entityId)).toEqual([project.id]);
  });

  it('leaves note out of changed when the task had no note', async () => {
    const task = workspace().tasks.createTask({ title: 'Solo' });
    expect(await mutate('tasks.convertToProject', { id: task.id })).toMatchObject({
      ok: true,
      changed: ['task', 'project'],
    });
  });

  it('refuses a synced task with external_read_only', async () => {
    const id = syncedTask();
    const result = await mutate('tasks.convertToProject', { id });
    expect(code(result)).toBe('external_read_only');
    expect(await data<Task>('tasks.get', { id })).toMatchObject({ archivedAt: null });
  });
});

describe('tasks.duplicate', () => {
  it('returns the copy, with task in changed', async () => {
    const task = workspace().tasks.createTask({ title: 'Write tests' });
    workspace().tasks.createSubtask(task.id, { title: 'Unit' });
    const result = await mutate<Task>('tasks.duplicate', { id: task.id });
    expect(result).toMatchObject({
      ok: true,
      data: { title: 'Copy of Write tests', external: null },
      changed: ['task'],
    });
    const copy = (result as { data: Task }).data;
    expect(
      workspace()
        .tasks.listSubtasks(copy.id)
        .items.map((t) => t.title),
    ).toEqual(['Unit']);
  });

  it('copies a synced task as a local one', async () => {
    const copy = await data<Task>('tasks.duplicate', { id: syncedTask() }, 'mutation');
    expect(copy).toMatchObject({ title: 'Copy of From Linear', external: null });
  });

  it('fails with not_found for an unknown task', async () => {
    expect(code(await mutate('tasks.duplicate', { id: 'tsk_missing' }))).toBe('not_found');
  });
});

describe('notes.duplicate', () => {
  it('returns the copy with its content, with note in changed', async () => {
    const note = await workspace().notes.createNote({ title: 'Minutes', content: 'Shipped' });
    const result = await mutate<Note>('notes.duplicate', { id: note.id });
    expect(result).toMatchObject({
      ok: true,
      data: { title: 'Copy of Minutes' },
      changed: ['note'],
    });
    const copy = (result as { data: Note }).data;
    expect(await data<string>('notes.readContent', { id: copy.id })).toBe('Shipped');
  });
});

describe('toMarkdown', () => {
  it('returns each entity as Markdown and changes nothing', async () => {
    const ws = workspace();
    const project = ws.projects.createProject({ title: 'Launch' });
    const task = ws.tasks.createTask({ title: 'Ship', projectId: project.id });
    ws.tasks.createSubtask(task.id, { title: 'Tag' });
    const note = await ws.notes.createNote({ title: 'Minutes', content: 'Done' });

    const taskMd = await call<string>('tasks.toMarkdown', { id: task.id });
    expect(taskMd).toMatchObject({ ok: true, changed: [] });
    expect((taskMd as { data: string }).data).toContain('# Ship\n');
    expect((taskMd as { data: string }).data).toContain('- [ ] Tag');

    const projectMd = await call<string>('projects.toMarkdown', { id: project.id });
    expect(projectMd).toMatchObject({ ok: true, changed: [] });
    expect((projectMd as { data: string }).data).toContain('## Not started\n\n- [ ] Ship');

    expect(await call('notes.toMarkdown', { id: note.id })).toMatchObject({
      ok: true,
      data: '# Minutes\n\nDone\n',
      changed: [],
    });
  });

  it('fails with not_found for an unknown entity', async () => {
    expect(code(await call('tasks.toMarkdown', { id: 'tsk_missing' }))).toBe('not_found');
    expect(code(await call('projects.toMarkdown', { id: 'prj_missing' }))).toBe('not_found');
    expect(code(await call('notes.toMarkdown', { id: 'nte_missing' }))).toBe('not_found');
  });
});
