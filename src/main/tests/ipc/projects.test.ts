import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevBrain, Workspace } from '@main/core';
import { type Page, type Project, type ProjectListItem, TaskStatus } from '@common/types';
import { ChangeTracker } from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, tempDevBrain, testContext } from './helpers';

// The projects router end to end, through the transport, over a real DevBrain folder. The change
// tracker fills each mutation's `changed`.

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

const mutate = <T>(path: string, input: unknown) => call<T>(path, input, 'mutation');

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

function dataOf<T>(result: Awaited<ReturnType<typeof call<T>>>): T {
  if (!result.ok) throw new Error(`call failed: ${JSON.stringify(result.error)}`);
  return result.data;
}

describe('projects.create', () => {
  it('creates a project alone, returning project in changed', async () => {
    const result = await mutate<Project>('projects.create', { title: ' Launch ' });
    expect(result).toMatchObject({
      ok: true,
      data: { title: 'Launch', external: null },
      changed: ['project'],
    });
  });

  it('creates a project with its first tasks, returning project and task in changed', async () => {
    const result = await mutate<Project>('projects.create', {
      title: 'Launch',
      tasks: [{ title: ' Plan ' }, { title: 'Ship' }],
    });
    expect(result).toMatchObject({ ok: true, changed: ['project', 'task'] });
    const project = dataOf(result);

    const tasks = workspace().tasks.listTasks({ projectId: project.id }).items;
    expect(tasks.map((task) => task.title).sort()).toEqual(['Plan', 'Ship']);
    // the tasks are in search, as any created task is
    const hits = workspace().search.search({ query: 'Ship', entityType: ['task'] });
    expect(hits.map((hit) => hit.entityId)).toContain(tasks.find((t) => t.title === 'Ship')!.id);
  });

  it('refuses a task with an empty title, creating nothing', async () => {
    const result = await mutate('projects.create', { title: 'Launch', tasks: [{ title: ' ' }] });
    expect(result.ok).toBe(false);
    expect(code(result)).toBe('invalid_input');
    expect(workspace().projects.listProjects().items).toEqual([]);
  });
});

describe('projects.list', () => {
  it('returns each project with its task stats', async () => {
    const project = dataOf(
      await mutate<Project>('projects.create', {
        title: 'Launch',
        tasks: [{ title: 'Plan' }, { title: 'Ship' }],
      }),
    );
    const [plan] = workspace().tasks.listTasks({ projectId: project.id }).items;
    workspace().tasks.updateStatus(plan.id, TaskStatus.COMPLETED);
    dataOf(await mutate<Project>('projects.create', { title: 'Empty' }));

    const page = dataOf(await call<Page<ProjectListItem>>('projects.list', {}));
    const byTitle = new Map(page.items.map((item) => [item.title, item.stats]));
    expect(byTitle.get('Launch')).toMatchObject({ numOfCompleted: 1, totalTasks: 2 });
    expect(byTitle.get('Empty')).toMatchObject({ numOfCompleted: 0, totalTasks: 0 });
  });
});
