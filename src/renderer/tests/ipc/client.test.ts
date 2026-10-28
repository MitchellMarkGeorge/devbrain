import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createTRPCClient, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { ChangedEntity } from '@common/changes';
import type { AppEvents } from '@common/events';
import type { IpcBridge, IpcErrorCode, IpcResult } from '@common/ipc/types';
import type { AppRouter } from '@main/ipc/router';
import { createEventClient } from '../../ipc/events';
import { ipcLink } from '../../ipc/link';
import type { IpcLinkOptions } from '../../ipc/link';

// a bridge whose invoke answers with `result`
function fakeBridge(result: IpcResult<unknown> = { ok: true, data: null, changed: [] }) {
  return {
    invoke: vi.fn<IpcBridge['invoke']>(async () => result),
    subscribe: vi.fn<IpcBridge['subscribe']>(() => () => {}),
  };
}

// a router to call through, beyond app.*; only its type is used, the fake bridge answers
const t = initTRPC.create();
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
const testRouter = t.router({
  tasks: t.router({
    get: t.procedure.input(z.object({ id: z.string() })).query(({ input }) => input),
    archive: t.procedure.input(z.object({ id: z.string() })).mutation(() => null),
  }),
});

function client(options: IpcLinkOptions) {
  return createTRPCClient<typeof testRouter>({ links: [ipcLink(options)] });
}

const rateLimited: IpcResult<unknown> = {
  ok: false,
  error: {
    code: -32603,
    message: 'Slow down',
    data: { code: 'rate_limited', message: 'Slow down', data: { retryAt: new Date(0) } },
  },
  changed: [],
};

describe('ipcLink', () => {
  it('invokes the dotted path with the input, and unwraps the data', async () => {
    const bridge = fakeBridge({ ok: true, data: { id: 'tsk_1' }, changed: [] });

    expect(await client({ bridge }).tasks.get.query({ id: 'tsk_1' })).toEqual({ id: 'tsk_1' });
    expect(bridge.invoke).toHaveBeenCalledWith('tasks.get', { id: 'tsk_1' });
  });

  it('calls app.ping with no input', async () => {
    const bridge = fakeBridge({ ok: true, data: 'pong', changed: [] });
    const ipc = createTRPCClient<AppRouter>({ links: [ipcLink({ bridge })] });

    expect(await ipc.app.ping.query()).toBe('pong');
    expect(bridge.invoke).toHaveBeenCalledWith('app.ping', undefined);
  });

  it('throws a TRPCClientError carrying our serialized error as data', async () => {
    const error = await client({ bridge: fakeBridge(rateLimited) })
      .tasks.get.query({ id: 'tsk_1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TRPCClientError);
    expect(error).toMatchObject({
      message: 'Slow down',
      data: { code: 'rate_limited', data: { retryAt: new Date(0) } },
    });
  });

  it('turns a failed invoke (no handler) into a TRPCClientError', async () => {
    const bridge = fakeBridge();
    bridge.invoke.mockRejectedValue(new Error("No handler registered for 'ipc:x'"));

    await expect(client({ bridge }).tasks.get.query({ id: 'x' })).rejects.toMatchObject({
      name: 'TRPCClientError',
      message: "No handler registered for 'ipc:x'",
    });
  });

  it('does not hang when a router node is awaited', async () => {
    const ipc = client({ bridge: fakeBridge() });

    // with a `then`, this would wait on a call that never settles, and time out
    const node: unknown = await ipc.tasks;
    expect(typeof node).toBe('function');
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

    const pending = client({ bridge, onChanged })
      .tasks.archive.mutate({ id: 'tsk_1' })
      .then(() => order.push('resolved'));
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
    const bridge = fakeBridge({ ...rateLimited, changed: ['task'] });

    await client({ bridge, onChanged })
      .tasks.archive.mutate({ id: 'tsk_1' })
      .catch(() => order.push('rejected'));

    expect(order).toEqual(['onChanged task', 'rejected']);
  });
});

// Checked by `npm run typecheck`
describe('the app client types', () => {
  type Ipc = ReturnType<typeof createTRPCClient<AppRouter>>;

  it('types app.ping', () => {
    expectTypeOf<ReturnType<Ipc['app']['ping']['query']>>().toEqualTypeOf<Promise<string>>();
  });

  it("types a failure's data as our serialized error", () => {
    expectTypeOf<
      NonNullable<TRPCClientError<AppRouter>['data']>['code']
    >().toEqualTypeOf<IpcErrorCode>();
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
