import { describe, expect, it, vi } from 'vitest';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import { IpcError } from '@common/ipc/errors';
import type { Procedure } from '@common/ipc/procedure';
import type { IpcBridge, IpcResult } from '@common/ipc/types';
import type { AppRouter } from '@main/ipc/router';
import { createClient } from '../../ipc/client';
import { createEventClient } from '../../ipc/events';

// a bridge whose invoke answers with `result`
function fakeBridge(result: IpcResult<unknown> = { ok: true, data: null, changed: [] }) {
  return {
    invoke: vi.fn<IpcBridge['invoke']>(async () => result),
    subscribe: vi.fn<IpcBridge['subscribe']>(() => () => {}),
  };
}

// a router type to call through, beyond app.*; only its shape matters here
type TestRouter = AppRouter & {
  tasks: {
    get: Procedure<'query', { id: string }, { id: string }>;
    archive: Procedure<'mutation', { id: string }, null>;
  };
};

describe('createClient', () => {
  it('invokes the dotted path with the input', async () => {
    const bridge = fakeBridge({ ok: true, data: { id: 'tsk_1' }, changed: [] });
    const client = createClient<TestRouter>({ bridge });

    expect(await client.tasks.get({ id: 'tsk_1' })).toEqual({ id: 'tsk_1' });
    expect(bridge.invoke).toHaveBeenCalledWith('tasks.get', { id: 'tsk_1' });
  });

  it('calls a procedure with no input', async () => {
    const bridge = fakeBridge({ ok: true, data: 'pong', changed: [] });
    const client = createClient<AppRouter>({ bridge });

    expect(await client.app.ping()).toBe('pong');
    expect(bridge.invoke).toHaveBeenCalledWith('app.ping', undefined);
  });

  it('throws an IpcError rebuilt from the envelope', async () => {
    const retryAt = new Date(0);
    const bridge = fakeBridge({
      ok: false,
      error: { code: 'rate_limited', message: 'Slow down', data: { retryAt } },
      changed: [],
    });
    const client = createClient<AppRouter>({ bridge });

    const error = await client.app.ping().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IpcError);
    expect(error).toMatchObject({ code: 'rate_limited', message: 'Slow down', data: { retryAt } });
  });

  it('turns a failed invoke (no handler) into an internal IpcError', async () => {
    const bridge = fakeBridge();
    bridge.invoke.mockRejectedValue(new Error("No handler registered for 'ipc:x'"));
    const client = createClient<AppRouter>({ bridge });

    await expect(client.app.ping()).rejects.toMatchObject({
      name: 'IpcError',
      code: 'internal',
      message: "No handler registered for 'ipc:x'",
    });
  });

  it('does not hang when a router node is awaited', async () => {
    const client = createClient<AppRouter>({ bridge: fakeBridge() });

    expect((client.app as unknown as { then: unknown }).then).toBeUndefined();
    // with a `then`, this would wait on a call that never settles, and time out
    const node: unknown = await client.app;
    expect(typeof node).toBe('function');
  });

  it('returns undefined for symbol keys', () => {
    const client = createClient<AppRouter>({ bridge: fakeBridge() });

    expect((client.app as unknown as Record<symbol, unknown>)[Symbol.toPrimitive]).toBeUndefined();
    expect((client as unknown as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
  });

  it('waits on onChanged before resolving', async () => {
    const order: string[] = [];
    let finishRefetch!: () => void;
    const onChanged = vi.fn(
      (changed: ChangedEntity[]) =>
        new Promise<void>((resolve) => {
          order.push(`onChanged ${changed.join()}`);
          finishRefetch = () => {
            order.push('refetched');
            resolve();
          };
        }),
    );
    const bridge = fakeBridge({ ok: true, data: null, changed: ['task', 'note'] });
    const client = createClient<TestRouter>({ bridge, onChanged });

    const pending = client.tasks.archive({ id: 'tsk_1' }).then(() => order.push('resolved'));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(order).toEqual(['onChanged task,note']);
    finishRefetch();
    await pending;

    expect(order).toEqual(['onChanged task,note', 'refetched', 'resolved']);
  });

  it('waits on onChanged before throwing, with the failed call’s changes', async () => {
    const order: string[] = [];
    const onChanged = vi.fn(async (changed: ChangedEntity[]) => {
      await Promise.resolve();
      order.push(`onChanged ${changed.join()}`);
    });
    const bridge = fakeBridge({
      ok: false,
      error: { code: 'internal', message: 'Something went wrong', data: {} },
      changed: ['task'],
    });
    const client = createClient<TestRouter>({ bridge, onChanged });

    await client.tasks.archive({ id: 'tsk_1' }).catch(() => order.push('rejected'));

    expect(order).toEqual(['onChanged task', 'rejected']);
  });
});

describe('createEventClient', () => {
  it('subscribes by name and passes the payload on', () => {
    const unsubscribe = vi.fn();
    const bridge = fakeBridge();
    bridge.subscribe.mockReturnValue(unsubscribe);
    const events = createEventClient<AppEvents>({ bridge });
    const listener = vi.fn();

    const off = events.on('db.changes', listener);
    bridge.subscribe.mock.calls[0][1]({ entities: ['task'] });
    off();

    expect(bridge.subscribe).toHaveBeenCalledWith('db.changes', expect.any(Function));
    expect(listener).toHaveBeenCalledWith({ entities: ['task'] });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
