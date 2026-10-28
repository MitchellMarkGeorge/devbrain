import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ExternalSourceId, WorkspaceId } from '@common/ids';
import type { DevBrain, Workspace } from '@main/core';
import type { ChangeListeners } from '@main/core/shared/changes';
import type { SyncProgress } from '@main/core/sync/types';
import { SyncMode } from '@main/core/sync/types';
import type { TaskChange } from '@main/core/tasks/service';
import { ChangeRouter } from '@main/ipc/changes/router';
import { openScope, withChangeScope } from '@main/ipc/changes/scope';
import { createWorkspace, fakeBroadcaster, tempDevBrain } from './helpers';

// The ChangeRouter over a real DevBrain folder and workspace: where each of core's changes goes,
// into the open scope of the call that made it or out as a broadcast.

let devBrain: DevBrain;
let cleanup: () => Promise<void>;
let ids: WorkspaceId[];
let broadcaster: ReturnType<typeof fakeBroadcaster>;
let detach: () => void;

const DUE = new Date('2026-11-01T00:00:00.000Z');

beforeEach(async () => {
  ({ devBrain, cleanup } = await tempDevBrain());
  ids = [await createWorkspace(devBrain, 'A'), await createWorkspace(devBrain, 'B')];
  broadcaster = fakeBroadcaster();
});

afterEach(async () => {
  detach?.();
  await cleanup();
});

async function openAndAttach(id: WorkspaceId = ids[0]): Promise<Workspace> {
  const workspace = await devBrain.workspaces.open(id);
  detach = new ChangeRouter(broadcaster).attach(devBrain);
  return workspace;
}

// sends a change through a service's own listeners, as core would; for a workspace that is no
// longer followed, or progress no test provider can produce
function emitTaskChange(workspace: Workspace, change: TaskChange) {
  (workspace.tasks as unknown as { changes: ChangeListeners<TaskChange> }).changes.emit(change);
}

function emitSyncProgress(workspace: Workspace, progress: SyncProgress) {
  const engine = (
    workspace.sync as unknown as { engine: { progress: ChangeListeners<SyncProgress> } }
  ).engine;
  engine.progress.emit(progress);
}

describe('ChangeRouter', () => {
  it("returns an archive's cascade in changed, and broadcasts nothing", async () => {
    const workspace = await openAndAttach();
    const task = workspace.tasks.createTask({ title: 'Ship', dueDate: DUE });
    await workspace.notes.createNote({ title: 'Notes on shipping', linkedTaskId: task.id });
    broadcaster.sent.length = 0;

    const result = await withChangeScope(() => workspace.archive.archiveTask(task.id));

    expect(result).toMatchObject({ ok: true });
    expect([...result.changed].sort()).toEqual(['note', 'task']);
    expect(broadcaster.sent).toEqual([]);
  });

  it('returns task for a favorite, and nothing for favoriting it again', async () => {
    const workspace = await openAndAttach();
    const task = workspace.tasks.createTask({ title: 'Star me', dueDate: DUE });

    const first = await withChangeScope(() => workspace.favorites.favoriteTask(task.id));
    const again = await withChangeScope(() => workspace.favorites.favoriteTask(task.id));

    expect(first.changed).toEqual(['task']);
    expect(again.changed).toEqual([]);
  });

  it("broadcasts a sync page outside any scope as db.changes, with its summary's types", async () => {
    const workspace = await openAndAttach();
    const sourceId = 'src_linear' as ExternalSourceId;

    emitSyncProgress(workspace, {
      sourceId,
      phase: SyncMode.INCREMENTAL,
      pages: 1,
      summary: { inserted: 2, updated: 1, removed: 0, changed: ['task', 'project'] },
      itemsApplied: 3,
    });

    expect(broadcaster.named('db.changes')).toEqual([{ entities: ['task', 'project'] }]);
    expect(broadcaster.named('sync.progress')).toEqual([
      { sourceId, phase: 'incremental', itemsApplied: 3 },
    ]);
  });

  it('broadcasts a change made after its scope closed', async () => {
    const workspace = await openAndAttach();
    let later!: Promise<unknown>;

    const result = await withChangeScope(() => {
      // work the call starts and doesn't wait for, like a sync run started by sync.now
      later = new Promise((resolve) => setTimeout(resolve, 5)).then(() =>
        workspace.tasks.createTask({ title: 'Late', dueDate: DUE }),
      );
      return null;
    });
    await later;

    expect(result.changed).toEqual([]);
    expect(broadcaster.named('db.changes')).toEqual([{ entities: ['task'] }]);
  });

  it('returns the write that committed before a throw', async () => {
    const workspace = await openAndAttach();

    const result = await withChangeScope(() => {
      workspace.tasks.createTask({ title: 'Committed', dueDate: DUE });
      throw new Error('after the commit');
    });

    expect(result).toMatchObject({ ok: false, changed: ['task'] });
    expect(broadcaster.sent).toEqual([]);
  });

  it("follows a switch: the old workspace's changes are ignored, the new one's routed", async () => {
    const first = await openAndAttach(ids[0]);

    const second = await devBrain.workspaces.open(ids[1]);
    broadcaster.sent.length = 0;
    emitTaskChange(first, {
      type: 'created',
      task: second.tasks.createTask({ title: 'In B', dueDate: DUE }),
    });

    // only B's own create, not the one sent through A's listeners
    expect(broadcaster.named('db.changes')).toEqual([{ entities: ['task'] }]);
  });

  it('broadcasts workspace.changed on close and on open, in order', async () => {
    await openAndAttach(ids[0]);

    await devBrain.workspaces.open(ids[1]);
    await devBrain.workspaces.close();

    expect(broadcaster.named('workspace.changed')).toEqual([
      { id: null },
      { id: ids[1] },
      { id: null },
    ]);
  });

  it('picks up a workspace that was already open before it attached', async () => {
    // openAndAttach opens first, as startDevBrain does before IPC attaches
    const workspace = await openAndAttach();

    workspace.tasks.createTask({ title: 'Seen', dueDate: DUE });

    expect(broadcaster.named('db.changes')).toEqual([{ entities: ['task'] }]);
    expect(broadcaster.named('workspace.changed')).toEqual([]);
  });

  it('stops routing once detached', async () => {
    const workspace = await openAndAttach();
    detach();

    workspace.tasks.createTask({ title: 'Unseen', dueDate: DUE });

    expect(broadcaster.sent).toEqual([]);
  });

  it('broadcasts the integration and source deltas whatever the scope', async () => {
    const workspace = await openAndAttach();
    const integrations = workspace.integrations as unknown as {
      changes: ChangeListeners<unknown>;
    };

    const result = await withChangeScope(() =>
      integrations.changes.emit({
        type: 'source_changed',
        integrationId: 'int_1',
        sourceId: 'src_1',
        enabled: false,
      }),
    );

    expect(result.changed).toEqual(['integration', 'externalSource']);
    expect(broadcaster.sent).toEqual([
      { name: 'integrations.changed', payload: { integrationId: 'int_1', type: 'source_changed' } },
      { name: 'sources.changed', payload: { sourceId: 'src_1' } },
    ]);
  });
});

describe('withChangeScope', () => {
  it('is open only while its function runs, awaits included', async () => {
    let during: unknown;
    let afterAwait: unknown;
    const result = await withChangeScope(async (scope) => {
      during = openScope() === scope;
      await new Promise((resolve) => setTimeout(resolve, 1));
      afterAwait = openScope() === scope;
      scope.record('task');
    });

    expect([during, afterAwait]).toEqual([true, true]);
    expect(result.changed).toEqual(['task']);
    expect(openScope()).toBeUndefined();
  });
});
