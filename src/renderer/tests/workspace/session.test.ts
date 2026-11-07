import { describe, expect, it, vi } from 'vitest';
import type { AppEvents } from '@common/events';
import type { WorkspaceId } from '@common/ids';
import type { WorkspaceInfo } from '@common/types';
import type { EventClient } from '../../ipc/events';
import { WorkspaceSession } from '../../workspace/session';

const A = 'wsp_a' as WorkspaceId;
const B = 'wsp_b' as WorkspaceId;
const info = (id: WorkspaceId) => ({ id, name: id }) as unknown as WorkspaceInfo;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function fakeEvents() {
  const listeners = new Set<(payload: AppEvents['workspace.changed']) => void>();
  const client = {
    on: (_name: string, listener: (payload: AppEvents['workspace.changed']) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as EventClient<AppEvents>;
  return {
    client,
    send: (payload: AppEvents['workspace.changed']) => listeners.forEach((l) => l(payload)),
  };
}

describe('WorkspaceSession', () => {
  it('opens nothing for the workspace already open, and opens another with onSwitch first', async () => {
    const open = vi.fn(async (id: WorkspaceId) => info(id));
    const onOpened = vi.fn();
    const session = new WorkspaceSession({ current: vi.fn(), open }, info(A), onOpened);
    const onSwitch = vi.fn();
    await session.ensureOpen(A, onSwitch);
    expect(open).not.toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();

    await session.ensureOpen(B, onSwitch);
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(B);
    expect(onOpened).toHaveBeenCalledWith(info(B));
    expect(session.openId).toBe(B);
  });

  it('asks main which is open when it started without knowing', async () => {
    const current = vi.fn(async () => info(A));
    const open = vi.fn(async (id: WorkspaceId) => info(id));
    const session = new WorkspaceSession({ current, open }, undefined);
    await Promise.all([session.ensureOpen(A), session.ensureOpen(A)]);
    expect(current).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it('joins an open under way for the same workspace, and queues one for another after it', async () => {
    const opens: { id: WorkspaceId; done: ReturnType<typeof deferred<WorkspaceInfo>> }[] = [];
    const open = vi.fn((id: WorkspaceId) => {
      const done = deferred<WorkspaceInfo>();
      opens.push({ id, done });
      return done.promise;
    });
    const session = new WorkspaceSession({ current: vi.fn(), open }, info(A));
    const toB = session.ensureOpen(B);
    const toBAgain = session.ensureOpen(B);
    expect(open).toHaveBeenCalledTimes(1);
    expect(session.isSettledOn(B)).toBe(false);
    expect(session.opening).toBe(true);

    // Back to A while B opens: A must open again after it, even though it was open before
    const toA = session.ensureOpen(A);
    expect(open).toHaveBeenCalledTimes(2);
    opens[0].done.resolve(info(B));
    await Promise.all([toB, toBAgain]);
    expect(session.opening).toBe(true);
    opens[1].done.resolve(info(A));
    await toA;
    expect(session.openId).toBe(A);
    expect(session.isSettledOn(A)).toBe(true);
  });

  it('rejects with the open’s error, keeping what main says is open', async () => {
    const events = fakeEvents();
    const failure = new Error('workspace_data_missing');
    const session = new WorkspaceSession(
      { current: vi.fn(), open: vi.fn(async () => Promise.reject(failure)) },
      info(A),
    );
    session.follow(events.client);
    await expect(session.ensureOpen(B)).rejects.toBe(failure);
    expect(session.openId).toBe(A);
    expect(session.opening).toBe(false);
  });

  it("tells its listeners of changes no open of its own made, and follows main's events", async () => {
    const events = fakeEvents();
    const opening = deferred<WorkspaceInfo>();
    const session = new WorkspaceSession(
      { current: vi.fn(), open: () => opening.promise },
      info(A),
    );
    session.follow(events.client);
    const outside = vi.fn();
    session.onOutsideChange(outside);

    // its own switch: every step is its own
    const toB = session.ensureOpen(B);
    events.send({ id: A, opening: B });
    events.send({ id: null, opening: B });
    expect(session.openId).toBeNull();
    events.send({ id: B, opening: null });
    opening.resolve(info(B));
    await toB;
    expect(outside).not.toHaveBeenCalled();

    // a delete
    events.send({ id: null, opening: null });
    expect(outside).toHaveBeenCalledWith({ id: null });
    expect(session.openId).toBeNull();
  });
});
