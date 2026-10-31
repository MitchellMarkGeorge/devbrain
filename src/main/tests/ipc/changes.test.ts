import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import type { AppEventName, AppEvents } from '@common/events';
import type { IpcResult } from '@common/ipc/types';
import type { DevBrain, Workspace } from '@main/core';
import { DEFAULT_CALENDAR_ID } from '@main/core/calendars/types';
import {
  ChangeTracker,
  entityOfFavoriteChange,
  entitiesOfArchiveChange,
  entitiesOfIntegrationChange,
  entitiesOfNoteChange,
  entitiesOfProjectChange,
  entitiesOfTaskChange,
  entitiesOfTaskLinkChange,
} from '@main/ipc/changes';
import { appRouter } from '@main/ipc/router';
import { attachRouter } from '@main/ipc/server';
import { t } from '@main/ipc/trpc';
import { wsProcedure } from '@main/ipc/procedures';
import { invokeHandler, resetElectronMock } from '../__mocks__/electron';
import { createWorkspace, tempDevBrain, testContext } from './helpers';

// What reaches the renderer when core changes rows: the change tracker over a real DevBrain folder,
// through the transport.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let tracker: ChangeTracker;
// a new one per test: a previous test's tracker may still send what its cleanup changed
let sendToWindows: Mock<
  (name: AppEventName, payload: AppEvents[AppEventName], skipWindow?: unknown) => void
>;

const DUE = new Date('2026-11-02T00:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  await devBrain.workspaces.open(await createWorkspace(devBrain, 'Work'));
  sendToWindows = vi.fn();
  tracker = new ChangeTracker(sendToWindows);
  tracker.watch(devBrain);
});

afterEach(async () => {
  resetElectronMock();
  await cleanup();
});

function workspace(): Workspace {
  return devBrain.currentWorkspace!;
}

// the app's routes, and two that do what a test passes them, against the open workspace
let action: (ws: Workspace) => unknown;
const testRouter = t.router({
  ...appRouter._def.record,
  act: wsProcedure.mutation(({ ctx }) => action(ctx.workspace)),
  peek: wsProcedure.query(({ ctx }) => action(ctx.workspace)),
});

function attach() {
  attachRouter(testRouter, { createContext: testContext(devBrain), changeTracker: tracker });
}

function act(
  run: (ws: Workspace) => unknown,
  sender: unknown = undefined,
  type: 'mutation' | 'query' = 'mutation',
) {
  action = run;
  const event = { sender } as IpcMainInvokeEvent;
  return invokeHandler('ipc:call', event, {
    path: type === 'mutation' ? 'act' : 'peek',
    type,
    input: undefined,
  }) as Promise<IpcResult<unknown>>;
}

// the db.changes events sent so far, with the window each skipped
function sentChanges() {
  return sendToWindows.mock.calls
    .filter(([name]) => name === 'db.changes')
    .map(([, payload, skipWindow]) => ({
      entities: (payload as AppEvents['db.changes']).entities,
      skipWindow,
    }));
}

// background changes are batched per turn of the event loop and sent at its end
function afterBackgroundBatchSent() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

describe('a mutation', () => {
  beforeEach(() => attach());

  it("returns a cascade's entities in its own response, and sends them only to the other windows", async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });
    await workspace().notes.createNote({ title: 'Plan', linkedTaskId: task.id });
    await afterBackgroundBatchSent();
    sendToWindows.mockReset();

    const result = await act((ws) => ws.archive.archiveTask(task.id), 'window-a');

    expect(result).toMatchObject({ ok: true });
    expect([...result.changed].sort()).toEqual(['note', 'task']);
    // the other windows learn of it as an event; the caller already has it
    expect(sentChanges()).toEqual([{ entities: result.changed, skipWindow: 'window-a' }]);
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

  it('reports a view as recent alone, so the lists of that entity are not refetched', async () => {
    const task = workspace().tasks.createTask({ title: 'Ship', dueDate: DUE });

    const result = await act((ws) => ws.recents.recordView(task.id));

    expect(result.changed).toEqual(['recent']);
  });

  it('reports a calendar shown or hidden', async () => {
    const result = await act((ws) => ws.calendars.setVisible(DEFAULT_CALENDAR_ID, false));

    expect(result.changed).toEqual(['calendar']);
  });

  it('leaves a query untracked, so what one changed is sent in the background', async () => {
    const result = await act(
      (ws) => ws.calendars.setVisible(DEFAULT_CALENDAR_ID, false),
      'w',
      'query',
    );

    expect(result).toMatchObject({ ok: true, changed: [] });
    await afterBackgroundBatchSent();
    expect(sentChanges()).toEqual([{ entities: ['calendar'], skipWindow: undefined }]);
  });

  it('sends what it left running once it has answered in the background, not in its response', async () => {
    let startLater!: () => void;
    const started = new Promise<void>((resolve) => (startLater = resolve));

    // like a connect whose sync run outlives it: the work inherits the mutation's async context
    const result = await act((ws) => {
      void started.then(() => ws.tasks.createTask({ title: 'Synced', dueDate: DUE }));
      return null;
    });
    startLater();
    // the task is written in the microtask after this, which then schedules the send
    await started;
    await afterBackgroundBatchSent();

    expect(result.changed).toEqual([]);
    expect(sentChanges()).toEqual([{ entities: ['task'], skipWindow: undefined }]);
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
    await afterBackgroundBatchSent();
    expect(sentChanges()).toContainEqual({ entities: ['project'], skipWindow: undefined });
  });
});

describe('changes outside any mutation', () => {
  it('are batched into one db.changes per turn of the event loop', async () => {
    const ws = workspace();

    const task = ws.tasks.createTask({ title: 'One', dueDate: DUE });
    ws.tasks.updateTask(task.id, { title: 'Two' });
    ws.events.createEvent({ title: 'Standup', startAt: DUE, endAt: DUE });
    expect(sentChanges()).toEqual([]);

    await afterBackgroundBatchSent();
    expect(sentChanges()).toEqual([{ entities: ['task', 'event'], skipWindow: undefined }]);

    ws.calendars.setVisible(DEFAULT_CALENDAR_ID, false);
    await afterBackgroundBatchSent();
    expect(sentChanges()).toEqual([
      { entities: ['task', 'event'], skipWindow: undefined },
      { entities: ['calendar'], skipWindow: undefined },
    ]);
  });

  it('send nothing once the tracker stops watching', async () => {
    tracker.watch(devBrain)();
    workspace().tasks.createTask({ title: 'Unseen', dueDate: DUE });
    await afterBackgroundBatchSent();

    expect(sentChanges()).toEqual([]);
  });
});

describe('switching workspace', () => {
  it('sends workspace.changed, and follows the new workspace', async () => {
    const old = workspace();
    const next = await createWorkspace(devBrain, 'Home');

    await devBrain.workspaces.open(next);

    expect(sendToWindows).toHaveBeenCalledWith('workspace.changed', { id: null });
    expect(sendToWindows).toHaveBeenCalledWith('workspace.changed', { id: next });
    await afterBackgroundBatchSent();
    sendToWindows.mockReset();
    workspace().tasks.createTask({ title: 'Here', dueDate: DUE });
    await afterBackgroundBatchSent();
    expect(sentChanges()).toEqual([{ entities: ['task'], skipWindow: undefined }]);
    expect(old).not.toBe(workspace());
  });

  it('returns workspace in the switching mutation, and sends workspace.changed to every window', async () => {
    attach();
    const next = await createWorkspace(devBrain, 'Home');
    const event = { sender: 'window-a' } as unknown as IpcMainInvokeEvent;

    const result = (await invokeHandler('ipc:call', event, {
      path: 'workspaces.open',
      type: 'mutation',
      input: { id: next },
    })) as IpcResult<unknown>;

    expect(result).toMatchObject({ ok: true, changed: ['workspace'] });
    expect(sendToWindows).toHaveBeenCalledWith('workspace.changed', { id: next });
  });

  it('reports a new workspace, which core announces, without saying the open one changed', async () => {
    attach();

    const result = (await invokeHandler('ipc:call', {} as IpcMainInvokeEvent, {
      path: 'workspaces.create',
      type: 'mutation',
      input: { name: 'Side', color: '#000000' },
    })) as IpcResult<unknown>;

    expect(result).toMatchObject({ ok: true, changed: ['workspace'] });
    expect(sendToWindows.mock.calls.filter(([name]) => name === 'workspace.changed')).toEqual([]);
  });

  it('reports a renamed open workspace without saying another one opened, and keeps following it', async () => {
    attach();
    const open = workspace();

    const result = (await invokeHandler('ipc:call', {} as IpcMainInvokeEvent, {
      path: 'workspaces.update',
      type: 'mutation',
      input: { id: open.info.id, name: 'Renamed' },
    })) as IpcResult<unknown>;

    expect(result).toMatchObject({ ok: true, changed: ['workspace'] });
    expect(sendToWindows.mock.calls.filter(([name]) => name === 'workspace.changed')).toEqual([]);
    expect(workspace()).toBe(open);
    expect(open.info.name).toBe('Renamed');

    // still listening to its services
    await afterBackgroundBatchSent();
    sendToWindows.mockReset();
    workspace().tasks.createTask({ title: 'After', dueDate: DUE });
    await afterBackgroundBatchSent();
    expect(sentChanges()).toEqual([{ entities: ['task'], skipWindow: undefined }]);
  });
});

describe('the entities of each change', () => {
  const none = { taskIds: [], projectIds: [], noteIds: [] };

  it('names what an archive cascaded to', () => {
    expect(
      entitiesOfArchiveChange({ type: 'archived', ...none, taskIds: ['tsk_1' as never] }),
    ).toEqual(['task']);
    expect(
      entitiesOfArchiveChange({
        type: 'restored',
        taskIds: ['tsk_1' as never],
        projectIds: ['prj_1' as never],
        noteIds: ['nte_1' as never],
      }),
    ).toEqual(['task', 'project', 'note']);
  });

  it('names what a delete removed, and the kinds of rows that lost a link to it', () => {
    const task = { type: 'updated' } as never;
    expect(entitiesOfTaskChange(task)).toEqual(['task']);
    expect(
      entitiesOfTaskChange({ type: 'deleted', taskIds: ['tsk_1' as never], unlinkedNoteIds: [] }),
    ).toEqual(['task']);
    expect(
      entitiesOfTaskChange({
        type: 'deleted',
        taskIds: ['tsk_1' as never],
        unlinkedNoteIds: ['nte_1' as never],
      }),
    ).toEqual(['task', 'note']);
    expect(entitiesOfProjectChange({ type: 'created' } as never)).toEqual(['project']);
    expect(
      entitiesOfProjectChange({
        type: 'deleted',
        projectId: 'prj_1' as never,
        unfiledTaskIds: ['tsk_1' as never],
        unfiledNoteIds: ['nte_1' as never],
      }),
    ).toEqual(['project', 'task', 'note']);
    expect(entitiesOfNoteChange({ type: 'updated' } as never)).toEqual(['note']);
    expect(
      entitiesOfNoteChange({
        type: 'deleted',
        noteId: 'nte_1' as never,
        linkedTaskId: null,
        unlinkedTaskIds: ['tsk_1' as never],
      }),
    ).toEqual(['note', 'task']);
    // a task note: its task has none now
    expect(
      entitiesOfNoteChange({
        type: 'deleted',
        noteId: 'nte_1' as never,
        linkedTaskId: 'tsk_1' as never,
        unlinkedTaskIds: [],
      }),
    ).toEqual(['note', 'task']);
    expect(
      entitiesOfNoteChange({
        type: 'deleted',
        noteId: 'nte_1' as never,
        linkedTaskId: null,
        unlinkedTaskIds: [],
      }),
    ).toEqual(['note']);
  });

  it('maps favorites, task links and integrations', () => {
    expect(
      entityOfFavoriteChange({ type: 'unfavorited', entityType: 'events', id: 'evt_1' as never }),
    ).toBe('event');
    expect(
      entitiesOfTaskLinkChange({
        type: 'reattached',
        taskId: 'tsk_1' as never,
        taskIds: [],
        changed: ['task', 'project'],
      } as never),
    ).toEqual(['task', 'task', 'project']);
    expect(
      entitiesOfTaskLinkChange({
        type: 'credentials_rejected',
        taskId: 'tsk_1' as never,
        integrationId: 'int_1' as never,
      }),
    ).toEqual(['integration']);
    const disconnected = entitiesOfIntegrationChange({
      type: 'disconnected',
      changed: ['task', 'event'],
    } as never);
    expect(disconnected).toEqual(['integration', 'externalSource', 'task', 'event']);
    expect(entitiesOfIntegrationChange({ type: 'source_changed' } as never)).toEqual([
      'integration',
      'externalSource',
    ]);
  });
});
