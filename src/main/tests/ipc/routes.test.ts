import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@common/ids';
import type { DevBrain, WorkspaceEntry } from '@main/core';
import { ChangeRouter } from '@main/ipc/changes/router';
import { wsProcedure } from '@main/ipc/procedures';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { t } from '@main/ipc/trpc';
import { resetElectronMock } from '../__mocks__/electron';
import { call, createWorkspace, fakeBroadcaster, tempDevBrain, testContext } from './helpers';

// The first routes end to end, through the transport, over a real DevBrain folder.

const DUE = new Date('2026-11-01T00:00:00.000Z');

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let broadcaster: ReturnType<typeof fakeBroadcaster>;
let detachChanges: () => void;
const openExternal = vi.fn(async () => {});

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain({ openExternal }));
  broadcaster = fakeBroadcaster();
  detachChanges = new ChangeRouter(broadcaster).attach(devBrain);
});

afterEach(async () => {
  detachChanges();
  resetElectronMock();
  openExternal.mockClear();
  await cleanup();
});

function attach(router: Parameters<typeof attachRouter>[0] = appRouter) {
  attachRouter(router, { createContext: testContext(devBrain) });
}

const code = (result: { ok: boolean }) =>
  (result as { error?: { data: { code: string } } }).error?.data.code;

describe('the base procedures', () => {
  it('fail with devbrain_unavailable when core did not start', async () => {
    attachRouter(appRouter, { createContext: testContext(null) });

    expect(code(await call('workspaces.list'))).toBe('devbrain_unavailable');
    expect(code(await call('settings.get'))).toBe('devbrain_unavailable');
    expect(code(await call('workspace.openUrl', { url: 'https://a.example' }, 'mutation'))).toBe(
      'devbrain_unavailable',
    );
    // and the public ones still run
    expect(await call('app.ping')).toMatchObject({ ok: true });
  });

  it('fail with no_workspace_open while none is open', async () => {
    attach();

    expect(code(await call('workspace.openUrl', { url: 'https://a.example' }, 'mutation'))).toBe(
      'no_workspace_open',
    );
  });

  it("return a mutation's own records and core's changes in one changed", async () => {
    await devBrain.workspaces.open(await createWorkspace(devBrain, 'A'));
    attach(
      t.router({
        create: wsProcedure.mutation(({ ctx }) => {
          ctx.workspace.tasks.createTask({ title: 'Routed', dueDate: DUE });
          ctx.changes.record('calendar');
          return null;
        }),
        failing: wsProcedure.mutation(({ ctx }) => {
          ctx.workspace.tasks.createTask({ title: 'Committed', dueDate: DUE });
          throw new Error('after the commit');
        }),
        // a query opens no scope: what core announces while it runs is broadcast
        sneaky: wsProcedure.query(({ ctx }) => {
          ctx.workspace.tasks.createTask({ title: 'From a query', dueDate: DUE });
          return null;
        }),
      }),
    );

    expect(await call('create', undefined, 'mutation')).toEqual({
      ok: true,
      data: null,
      changed: ['task', 'calendar'],
    });
    expect(await call('failing', undefined, 'mutation')).toMatchObject({
      ok: false,
      changed: ['task'],
    });
    expect(broadcaster.named('db.changes')).toEqual([]);

    expect(await call('sneaky')).toEqual({ ok: true, data: null, changed: [] });
    expect(broadcaster.named('db.changes')).toEqual([{ entities: ['task'] }]);
  });
});

describe('workspaces', () => {
  beforeEach(() => attach());

  it('creates, lists, opens one then another, and deletes, returning WorkspaceInfo', async () => {
    const created = await call<WorkspaceEntry>(
      'workspaces.create',
      { name: ' Work ', color: '#112233' },
      'mutation',
    );
    expect(created).toMatchObject({
      ok: true,
      data: { name: 'Work', color: '#112233', lastOpenedAt: null },
      changed: ['workspace'],
    });
    const work = (created as { data: WorkspaceEntry }).data.id;
    const home = await createWorkspace(devBrain, 'Home');

    const list = await call<{ items: WorkspaceEntry[] }>('workspaces.list', {});
    expect(list.ok && list.data.items.map(({ name }) => name)).toEqual(['Work', 'Home']);
    expect(await call('workspaces.current')).toMatchObject({ ok: true, data: null });

    expect(await call('workspaces.open', { id: work }, 'mutation')).toMatchObject({
      ok: true,
      data: { id: work },
      changed: ['workspace'],
    });
    expect(await call('workspaces.current')).toMatchObject({ data: { id: work } });
    expect(devBrain.settings.get('state.lastWorkspaceId')).toBe(work);

    expect(await call('workspaces.open', { id: home }, 'mutation')).toMatchObject({
      ok: true,
      data: { id: home },
    });
    expect(devBrain.settings.get('state.lastWorkspaceId')).toBe(home);
    expect(broadcaster.named('workspace.changed')).toEqual([
      { id: work },
      { id: null },
      { id: home },
    ]);

    expect(await call('workspaces.delete', { id: home }, 'mutation')).toEqual({
      ok: true,
      data: undefined,
      changed: ['workspace'],
    });
    expect(devBrain.settings.get('state.lastWorkspaceId')).toBeNull();
    expect(await call('workspaces.current')).toMatchObject({ data: null });
  });

  it("passes core's errors through, and still reports what may have changed", async () => {
    const closed = await createWorkspace(devBrain, 'Closed');

    expect(await call('workspaces.delete', { id: closed }, 'mutation')).toMatchObject({
      ok: false,
      error: { data: { code: 'workspace_not_open' } },
      changed: ['workspace'],
    });
    expect(
      code(await call('workspaces.open', { id: 'wsp_missing' as WorkspaceId }, 'mutation')),
    ).toBe('not_found');
  });

  it('refuses an id of another entity, a blank name and a colour that is not #rrggbb', async () => {
    expect(code(await call('workspaces.open', { id: 'tsk_1' }, 'mutation'))).toBe('invalid_input');
    expect(
      code(await call('workspaces.create', { name: '  ', color: '#000000' }, 'mutation')),
    ).toBe('invalid_input');
    expect(code(await call('workspaces.create', { name: 'X', color: 'red' }, 'mutation'))).toBe(
      'invalid_input',
    );
  });
});

describe('settings', () => {
  beforeEach(() => attach());

  it('gets the settings', async () => {
    expect(await call('settings.get')).toMatchObject({
      ok: true,
      data: { theme: 'dark', general: { timeFormat: expect.any(String) } },
      changed: [],
    });
  });

  it('replaces the settings and returns them', async () => {
    const settings = devBrain.settings.get('settings');
    const changed = { ...settings, general: { ...settings.general, timeFormat: '24' as const } };

    expect(await call('settings.update', changed, 'mutation')).toEqual({
      ok: true,
      data: changed,
      changed: ['settings'],
    });
    expect(devBrain.settings.get('settings.general.timeFormat')).toBe('24');
  });

  it("refuses settings core's schema refuses, writing nothing", async () => {
    const settings = devBrain.settings.get('settings');
    const refused = [
      { ...settings, general: { ...settings.general, timeFormat: '13' } },
      { ...settings, general: undefined },
    ];
    for (const input of refused) {
      expect(await call('settings.update', input, 'mutation')).toMatchObject({
        ok: false,
        error: { data: { code: 'invalid_input' } },
        changed: [],
      });
    }
    expect(devBrain.settings.get('settings')).toEqual(settings);
  });
});

describe('workspace.openUrl', () => {
  beforeEach(async () => {
    attach();
    await devBrain.workspaces.open(await createWorkspace(devBrain, 'A'));
  });

  it('opens a web link in the browser', async () => {
    expect(await call('workspace.openUrl', { url: 'https://linear.app/x' }, 'mutation')).toEqual({
      ok: true,
      data: undefined,
      changed: [],
    });
    expect(openExternal).toHaveBeenCalledWith('https://linear.app/x');
  });

  it("refuses anything else with core's unsafe_url, having opened nothing", async () => {
    expect(code(await call('workspace.openUrl', { url: 'javascript:alert(1)' }, 'mutation'))).toBe(
      'unsafe_url',
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
});
