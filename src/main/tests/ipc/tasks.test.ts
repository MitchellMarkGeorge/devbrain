import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskId } from '@common/ids';
import type { DevBrain, Workspace } from '@main/core';
import type { Page } from '@main/core/shared/pagination';
import { Provider, type ExternalTask } from '@main/core/integrations/types';
import { TaskPriority, TaskStatus, type Task } from '@main/core/tasks/types';
import { FakeCipher } from '@main/core/tests/__mocks__/fake-cipher';
import {
  createFakeProvider,
  FAKE_API_KEY,
  fakeRegistry,
  type FakeProvider,
} from '@main/core/tests/sync/fake-provider';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The tasks router end to end, through the transport, over a real DevBrain folder whose workspace
// syncs through a fake Linear. The change tracker fills each mutation's `changed`.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let provider: FakeProvider;

const DUE = new Date('2026-11-02T00:00:00.000Z');

beforeEach(async () => {
  provider = createFakeProvider();
  ({ devBrain, cleanup } = await tempDevBrain({
    cipher: new FakeCipher(),
    providers: fakeRegistry(provider),
  }));
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  // the open pass runs on the next turn; a connect after it starts exactly one sync run
  await new Promise((resolve) => setImmediate(resolve));
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

const mutate = <T>(path: string, input: unknown) => call<T>(path, input, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

// the result's data, failing the test with the error when the call failed
function dataOf<T>(result: Awaited<ReturnType<typeof call<T>>>): T {
  if (!result.ok) throw new Error(`call failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

function issue(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    externalId: 'issue-1',
    key: 'ENG-1',
    url: 'https://linear.app/acme/issue/ENG-1',
    title: 'From Linear',
    description: null,
    status: TaskStatus.NOT_STARTED,
    priority: TaskPriority.LOW,
    statusLabel: 'Todo',
    priorityLabel: 'Low',
    startDate: null,
    dueDate: null,
    completedAt: null,
    createdAt: new Date('2026-01-15T09:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    parentExternalId: null,
    parentKey: null,
    parentTitle: null,
    projectExternalId: null,
    assignedToViewer: true,
    ...overrides,
  };
}

// connects the fake Linear, which mirrors `item`, and returns the synced task's id
async function syncedTask(item: ExternalTask): Promise<TaskId> {
  provider.tasks.script({ tasks: [item] });
  await workspace().integrations.connectWithApiKey(Provider.LINEAR, FAKE_API_KEY);
  await vi.waitFor(() => {
    const [status] = workspace().sync.getStatus();
    expect(status).toMatchObject({ running: false, lastError: null });
    expect(status.lastSyncedAt).not.toBeNull();
  });
  const [task] = workspace().tasks.listTasks({ origin: 'external' }).items;
  return task.id;
}

describe('tasks', () => {
  it('creates, reads, lists by page and edits a task, returning task in changed', async () => {
    const created = await mutate<Task>('tasks.create', { title: ' Write tests ', dueDate: DUE });
    expect(created).toMatchObject({
      ok: true,
      data: { title: 'Write tests', dueDate: DUE, status: TaskStatus.NOT_STARTED, external: null },
      changed: ['task'],
    });
    const id = dataOf(created).id;
    const other = dataOf(await mutate<Task>('tasks.create', { title: 'Other', dueDate: DUE })).id;

    expect(await call('tasks.get', { id })).toMatchObject({ ok: true, data: { id } });

    // pages through, with the cursor at the top of the input as infiniteQueryOptions passes it
    const first = dataOf(await call<Page<Task>>('tasks.list', { limit: 1 }));
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = dataOf(
      await call<Page<Task>>('tasks.list', { limit: 1, cursor: first.nextCursor }),
    );
    expect([...first.items, ...second.items].map((task) => task.id).sort()).toEqual(
      [id, other].sort(),
    );
    const filtered = dataOf(
      await call<Page<Task>>('tasks.list', {
        filter: { status: TaskStatus.NOT_STARTED, projectId: null },
        sort: { sortBy: 'dueDate', direction: 'asc' },
      }),
    );
    expect(filtered.items).toHaveLength(2);

    expect(
      await mutate('tasks.update', {
        id,
        priority: TaskPriority.HIGH,
        pullRequestUrl: 'https://github.com/acme/app/pull/1',
      }),
    ).toMatchObject({
      ok: true,
      data: { priority: TaskPriority.HIGH, pullRequestUrl: 'https://github.com/acme/app/pull/1' },
      changed: ['task'],
    });
    expect(await mutate('tasks.updateStatus', { id, status: TaskStatus.COMPLETED })).toMatchObject({
      ok: true,
      data: { status: TaskStatus.COMPLETED },
      changed: ['task'],
    });

    const project = workspace().projects.createProject({ title: 'App', dueDate: DUE });
    expect(await mutate('tasks.updateProject', { id, projectId: project.id })).toMatchObject({
      ok: true,
      data: { projectId: project.id },
      changed: ['task'],
    });
    const note = await workspace().notes.createNote({ title: 'Design' });
    expect(await mutate('tasks.updateLinks', { id, linkedNoteId: note.id })).toMatchObject({
      ok: true,
      data: { linkedNoteId: note.id, linkedEventId: null },
      changed: ['task'],
    });
  });

  it('creates subtasks, lists them, and promotes and demotes tasks', async () => {
    const parent = workspace().tasks.createTask({ title: 'Parent', dueDate: DUE });

    const subtask = await mutate<Task>('tasks.createSubtask', {
      parentTaskId: parent.id,
      title: 'Child',
    });
    // takes the parent's due date when it has none of its own
    expect(subtask).toMatchObject({
      ok: true,
      data: { parentTaskId: parent.id, dueDate: DUE },
      changed: ['task'],
    });
    const childId = dataOf(subtask).id;
    expect(
      dataOf(await call<Page<Task>>('tasks.subtasks', { id: parent.id })).items.map(
        (task) => task.id,
      ),
    ).toEqual([childId]);

    expect(await mutate('tasks.promote', { id: childId })).toMatchObject({
      ok: true,
      data: { parentTaskId: null },
      changed: ['task'],
    });
    expect(await mutate('tasks.demote', { id: childId, parentTaskId: parent.id })).toMatchObject({
      ok: true,
      data: { parentTaskId: parent.id },
      changed: ['task'],
    });
  });

  it('sets the favorite to the state asked for, sending nothing when it already is', async () => {
    const { id } = workspace().tasks.createTask({ title: 'Star me', dueDate: DUE });

    const favorited = await mutate<Task>('tasks.setFavorite', { id, favorite: true });
    expect(favorited).toMatchObject({ ok: true, changed: ['task'] });
    expect(dataOf(favorited).favoritedAt).toBeInstanceOf(Date);
    // a double click asks for the same state again: nothing changed, nothing to refetch
    expect(await mutate('tasks.setFavorite', { id, favorite: true })).toMatchObject({
      ok: true,
      changed: [],
    });
    expect(await mutate('tasks.setFavorite', { id, favorite: false })).toMatchObject({
      ok: true,
      data: { favoritedAt: null },
      changed: ['task'],
    });
  });

  it("passes core's errors through", async () => {
    const { id } = workspace().tasks.createTask({ title: 'Top level', dueDate: DUE });

    expect(code(await mutate('tasks.promote', { id }))).toBe('task_hierarchy');
    expect(code(await mutate('tasks.demote', { id, parentTaskId: id }))).toBe('task_hierarchy');
    expect(code(await call('tasks.get', { id: 'tsk_missing' }))).toBe('not_found');
    // a local task has no link to detach
    expect(code(await mutate('tasks.detach', { id }))).toBe('detach_failed');
  });

  it('refuses an id of another entity, a blank title and a URL that may not be opened', async () => {
    const { id } = workspace().tasks.createTask({ title: 'Task', dueDate: DUE });

    expect(code(await call('tasks.get', { id: 'prj_1' }))).toBe('invalid_input');
    expect(code(await mutate('tasks.create', { title: '  ', dueDate: DUE }))).toBe('invalid_input');
    expect(code(await mutate('tasks.update', { id, pullRequestUrl: 'javascript:alert(1)' }))).toBe(
      'invalid_input',
    );
    expect(code(await mutate('tasks.updateStatus', { id, status: 9 }))).toBe('invalid_input');
  });

  it('leaves a synced task read-only until it is detached, and reattaches it', async () => {
    const item = issue();
    const id = await syncedTask(item);

    expect(await mutate('tasks.update', { id, title: 'Mine' })).toMatchObject({
      ok: false,
      error: { data: { code: 'external_read_only' } },
      changed: [],
    });

    const detached = await mutate<Task>('tasks.detach', { id });
    expect(detached).toMatchObject({ ok: true, data: { id, external: { state: 'detached' } } });
    expect(detached.changed).toContain('task');
    expect(await mutate('tasks.update', { id, title: 'Mine' })).toMatchObject({
      ok: true,
      data: { title: 'Mine' },
      changed: ['task'],
    });

    // Linear still has the issue, so the reattach takes its title back
    provider.tasks.respondToLookup = () => ({ tasks: [item] });
    const reattached = await mutate<Task>('tasks.reattach', { id });
    expect(reattached).toMatchObject({
      ok: true,
      data: { id, title: 'From Linear', external: { state: 'synced' } },
    });
    expect(reattached.changed).toContain('task');
  });
});
