import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import type { ChangedEntity } from '@common/changes';
import type { AppEventName, AppEvents } from '@common/events';
import type { IpcResult } from '@common/ipc/types';
import type { DevBrain, Workspace } from '@main/core';
import { DEFAULT_CALENDAR_ID } from '@main/core/calendars/types';
import {
  archiveKinds,
  ChangeHub,
  favoriteKind,
  integrationKinds,
  PUSH_DELAY_MS,
  taskLinkKinds,
} from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { t } from '@main/ipc/trpc';
import { wsProcedure } from '@main/ipc/procedures';
import { invokeHandler, resetElectronMock } from '../__mocks__/electron';
import { createWorkspace, tempDevBrain, testContext } from './helpers';

// What reaches the renderer when core changes rows: the hub over a real DevBrain folder, through
// the transport.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let hub: ChangeHub;
// a new one per test: a previous test's hub may still flush what its cleanup changed
let push: Mock<(name: AppEventName, payload: AppEvents[AppEventName], except?: unknown) => void>;

const DUE = new Date('2026-11-02T00:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  push = vi.fn();
  hub = new ChangeHub(push);
  hub.watch(devBrain);
});

afterEach(async () => {
  vi.useRealTimers();
  resetElectronMock();
  await cleanup();
});

function workspace(): Workspace {
  return devBrain.currentWorkspace!;
}

type Ctx = { changes: { record(...entities: ChangedEntity[]): void } };

// the app's routes, and one whose mutation does what a test passes it, against the open workspace
let action: (ws: Workspace, ctx: Ctx) => unknown;
const testRouter = t.router({
  ...appRouter._def.record,
  act: wsProcedure.mutation(({ ctx }) => action(ctx.workspace, ctx)),
});

function attach() {
  attachRouter(testRouter, { createContext: testContext(devBrain), tracker: hub });
}

function act(run: (ws: Workspace, ctx: Ctx) => unknown, sender: unknown = undefined) {
  action = run;
  const event = { sender } as IpcMainInvokeEvent;
  return invokeHandler('ipc:call', event, {
    path: 'act',
    type: 'mutation',
    input: undefined,
  }) as Promise<IpcResult<unknown>>;
}

// the db.changes events pushed so far, with the window each skipped
function pushedChanges() {
  return push.mock.calls
    .filter(([name]) => name === 'db.changes')
    .map(([, payload, except]) => ({
      entities: (payload as AppEvents['db.changes']).entities,
      except,
    }));
}

describe('a call', () => {
  beforeEach(() => attach());

  it("returns a cascade's kinds in its own response, and pushes nothing to its window", async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    await workspace().notes.createNote({ title: 'Plan', linkedTaskId: task.id });
    hub.flush();
    push.mockReset();

    const result = await act((ws) => ws.archive.archiveTask(task.id), 'window-a');

    expect(result).toMatchObject({ ok: true });
    expect([...result.changed].sort()).toEqual(['note', 'task']);
    // the other windows learn of it as an event; the caller already has it
    expect(pushedChanges()).toEqual([{ entities: result.changed, except: 'window-a' }]);
  });

  it('returns what it changed after an await, as note content saves do', async () => {
    const result = await act((ws) => ws.notes.createNote({ title: 'Later' }));

    expect(result.changed).toEqual(['note']);
  });

  it('returns what committed before it failed', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });

    const result = await act((ws) => {
      ws.favorites.favoriteTask(task.id);
      throw new Error('after the commit');
    });

    expect(result).toMatchObject({ ok: false, changed: ['task'] });
  });

  it('reports a calendar shown or hidden', async () => {
    const result = await act((ws) => ws.calendars.setVisible(DEFAULT_CALENDAR_ID, false));

    expect(result.changed).toEqual(['calendar']);
  });

  it('keeps what its resolver records, beside what core announced', async () => {
    const result = await act((ws, ctx) => {
      ws.projects.createProject({ title: 'Q4', dueDate: DUE });
      ctx.changes.record('integration');
      return null;
    });

    expect(result.changed).toEqual(['project', 'integration']);
  });

  it('pushes what it left running once it has answered, rather than in its response', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let later!: () => void;
    const started = new Promise<void>((resolve) => (later = resolve));

    // like a connect whose sync run outlives it: the work inherits the call's async context
    const result = await act((ws) => {
      void started.then(() => ws.tasks.createTask({ title: 'Synced', dueDate: DUE }));
      return null;
    });
    later();
    await started;
    await Promise.resolve();

    expect(result.changed).toEqual([]);
    expect(pushedChanges()).toEqual([]);
    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(pushedChanges()).toEqual([{ entities: ['task'], except: undefined }]);
  });

  it('leaves out what something else changed while it waited', async () => {
    let resume!: () => void;
    const waiting = new Promise<void>((resolve) => (resume = resolve));

    const pending = act(async (ws) => {
      await waiting;
      ws.events.createEvent({ title: 'Standup', startAt: DUE, endAt: DUE });
    });
    // a sync page, say, committing while the call awaits its file write
    workspace().projects.createProject({ title: 'Elsewhere', dueDate: DUE });
    resume();
    const result = await pending;

    expect(result.changed).toEqual(['event']);
    hub.flush();
    expect(pushedChanges()).toContainEqual({ entities: ['project'], except: undefined });
  });
});

describe('changes outside any call', () => {
  it('are gathered into one db.changes per PUSH_DELAY_MS', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const ws = workspace();

    const task = ws.tasks.createTask({ title: 'One', dueDate: DUE });
    ws.tasks.updateTask(task.id, { title: 'Two' });
    ws.events.createEvent({ title: 'Standup', startAt: DUE, endAt: DUE });
    expect(pushedChanges()).toEqual([]);

    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(pushedChanges()).toEqual([{ entities: ['task', 'event'], except: undefined }]);

    ws.calendars.setVisible(DEFAULT_CALENDAR_ID, false);
    vi.advanceTimersByTime(PUSH_DELAY_MS);
    expect(pushedChanges()).toHaveLength(2);
  });

  it('push nothing once the hub stops watching', () => {
    hub.watch(devBrain)();
    workspace().tasks.createTask({ title: 'Unseen', dueDate: DUE });
    hub.flush();

    expect(pushedChanges()).toEqual([]);
  });
});

describe('switching workspace', () => {
  it('pushes workspace.changed, and follows the new workspace', async () => {
    const old = workspace();
    const next = await createWorkspace(devBrain, 'Home');

    await devBrain.workspaces.open(next);

    expect(push).toHaveBeenCalledWith('workspace.changed', { id: null }, undefined);
    expect(push).toHaveBeenCalledWith('workspace.changed', { id: next }, undefined);
    hub.flush();
    push.mockReset();
    workspace().tasks.createTask({ title: 'Here', dueDate: DUE });
    hub.flush();
    expect(pushedChanges()).toEqual([{ entities: ['task'], except: undefined }]);
    expect(old).not.toBe(workspace());
  });

  it('returns workspace in the switching call, and tells only the other windows', async () => {
    attach();
    const next = await createWorkspace(devBrain, 'Home');
    const event = { sender: 'window-a' } as unknown as IpcMainInvokeEvent;

    const result = (await invokeHandler('ipc:call', event, {
      path: 'workspaces.open',
      type: 'mutation',
      input: { id: next },
    })) as IpcResult<unknown>;

    expect(result).toMatchObject({ ok: true, changed: ['workspace'] });
    expect(push).toHaveBeenCalledWith('workspace.changed', { id: next }, 'window-a');
  });

  it('records a new workspace in the list', async () => {
    attach();

    const result = (await invokeHandler('ipc:call', {} as IpcMainInvokeEvent, {
      path: 'workspaces.create',
      type: 'mutation',
      input: { name: 'Side', color: '#000000' },
    })) as IpcResult<unknown>;

    expect(result).toMatchObject({ ok: true, changed: ['workspace'] });
  });
});

describe('the kinds of each change', () => {
  const none = { taskIds: [], projectIds: [], noteIds: [] };

  it('names what an archive cascaded to', () => {
    expect(archiveKinds({ type: 'archived', ...none, taskIds: ['tsk_1' as never] })).toEqual([
      'task',
    ]);
    expect(
      archiveKinds({
        type: 'restored',
        taskIds: ['tsk_1' as never],
        projectIds: ['prj_1' as never],
        noteIds: ['nte_1' as never],
      }),
    ).toEqual(['task', 'project', 'note']);
  });

  it('maps favorites, task links and integrations', () => {
    expect(favoriteKind({ type: 'unfavorited', entityType: 'events', id: 'evt_1' as never })).toBe(
      'event',
    );
    expect(
      taskLinkKinds({
        type: 'reattached',
        taskId: 'tsk_1' as never,
        taskIds: [],
        changed: ['task', 'project'],
      } as never),
    ).toEqual(['task', 'task', 'project']);
    expect(
      taskLinkKinds({
        type: 'credentials_rejected',
        taskId: 'tsk_1' as never,
        integrationId: 'int_1' as never,
      }),
    ).toEqual(['integration']);
    const disconnected = integrationKinds({
      type: 'disconnected',
      changed: ['task', 'event'],
    } as never);
    expect(disconnected).toEqual(['integration', 'externalSource', 'task', 'event']);
    expect(integrationKinds({ type: 'source_changed' } as never)).toEqual([
      'integration',
      'externalSource',
    ]);
  });
});
