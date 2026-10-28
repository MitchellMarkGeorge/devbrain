import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { TRPCError } from '@trpc/server';
import { IpcError } from '@common/ipc/errors';
import type { IpcResult } from '@common/ipc/types';
import { RateLimitError } from '@main/core/shared/errors';
import { attachRouter } from '@main/ipc/server';
import type { IpcErrorInfo } from '@main/ipc/server';
import { appRouter } from '@main/ipc/router';
import { createContext } from '@main/ipc/context';
import { t } from '@main/ipc/trpc';
import { invokeHandler, ipcHandlers, resetElectronMock } from '../__mocks__/electron';

const event = {} as IpcMainInvokeEvent;

function call(path: string, input?: unknown) {
  return invokeHandler(`ipc:${path}`, event, input) as Promise<IpcResult<unknown>>;
}

function attach(
  router: Parameters<typeof attachRouter>[0],
  options: { checkClone?: boolean; onError?: (info: IpcErrorInfo) => void } = {},
) {
  return attachRouter(router, { createContext, ...options });
}

describe('attachRouter', () => {
  afterEach(() => resetElectronMock());

  it('answers a query with its data and no changes', async () => {
    attach(t.router({ app: t.router({ ping: t.procedure.query(() => 'pong') }) }));

    expect(await call('app.ping')).toEqual({ ok: true, data: 'pong', changed: [] });
  });

  it('gives the resolver the parsed input', async () => {
    attach(
      t.router({
        list: t.procedure
          .input(z.object({ limit: z.number().default(10) }))
          .query(({ input }) => input.limit),
      }),
    );

    expect(await call('list', {})).toMatchObject({ ok: true, data: 10 });
  });

  it('answers invalid_input with the issues, without running the resolver', async () => {
    const resolver = vi.fn(() => null);
    attach(t.router({ get: t.procedure.input(z.object({ id: z.string() })).query(resolver) }));

    const result = await call('get', { id: 42 });

    expect(result).toMatchObject({
      ok: false,
      error: {
        data: {
          code: 'invalid_input',
          data: { issues: [{ path: ['id'], message: expect.any(String) }] },
        },
      },
      changed: [],
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("passes a CoreError's code, message and fields through", async () => {
    const retryAt = new Date('2026-01-01T00:00:00.000Z');
    attach(
      t.router({
        sync: t.procedure.mutation(() => {
          throw new RateLimitError(retryAt);
        }),
      }),
    );

    expect(await call('sync')).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining('2026'),
        data: { code: 'rate_limited', message: expect.stringContaining('2026'), data: { retryAt } },
      },
    });
  });

  it('keeps an IpcError thrown by a middleware, which stops the call', async () => {
    const resolver = vi.fn(() => null);
    const guarded = t.procedure.use(() => {
      throw new IpcError('no_workspace_open', 'Open a workspace first');
    });
    attach(t.router({ guarded: guarded.query(resolver) }));

    expect(await call('guarded')).toMatchObject({
      ok: false,
      error: { data: { code: 'no_workspace_open', message: 'Open a workspace first' } },
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it('answers internal for anything else, and reports the original to onError', async () => {
    const onError = vi.fn();
    const thrown = new Error('database is locked');
    attach(
      t.router({
        broken: t.procedure.query(() => {
          throw thrown;
        }),
        trpcError: t.procedure.query(() => {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'internal detail' });
        }),
      }),
      { onError },
    );

    expect(await call('broken')).toMatchObject({
      ok: false,
      error: {
        message: 'Something went wrong',
        data: { code: 'internal', message: 'Something went wrong', data: {} },
      },
    });
    expect(onError.mock.calls[0][0]).toMatchObject({ path: 'broken', error: { cause: thrown } });
    // a TRPCError thrown directly is not one of ours either
    expect(await call('trpcError')).toMatchObject({ error: { data: { code: 'internal' } } });
  });

  it('runs middleware in order, around the resolver, with the context each one adds', async () => {
    const order: string[] = [];
    const procedure = t.procedure
      .use(async ({ next, path, type }) => {
        order.push(`first ${path} ${type}`);
        const result = await next({ ctx: { user: 'grace' } });
        order.push('first after');
        return result;
      })
      .use(({ ctx, next }) => {
        order.push(`second ${ctx.user}`);
        return next();
      })
      .mutation(({ ctx }) => {
        order.push('resolver');
        return ctx.user;
      });
    attach(t.router({ save: procedure }));

    expect(await call('save')).toMatchObject({ ok: true, data: 'grace' });
    expect(order).toEqual(['first save mutation', 'second grace', 'resolver', 'first after']);
  });

  it('returns what the call recorded as changed, on success and on failure', async () => {
    attach(
      t.router({
        archive: t.procedure.mutation(({ ctx }) => {
          ctx.changes.record('task', 'note', 'task');
          return null;
        }),
        failsAfterWriting: t.procedure.mutation(({ ctx }) => {
          ctx.changes.record('task');
          throw new Error('after the commit');
        }),
      }),
    );

    expect(await call('archive')).toEqual({ ok: true, data: null, changed: ['task', 'note'] });
    expect(await call('failsAfterWriting')).toMatchObject({ ok: false, changed: ['task'] });
  });

  it('with checkClone, fails a result IPC cannot send, naming the path', async () => {
    attach(t.router({ app: t.router({ fn: t.procedure.query(() => ({ run: () => 1 })) }) }), {
      checkClone: true,
    });

    const result = await call('app.fn');

    expect(result).toMatchObject({ ok: false, error: { data: { code: 'internal' } } });
    expect(!result.ok && result.error.message).toMatch(/'app\.fn' returned a value IPC can't send/);
  });

  it('refuses subscriptions', () => {
    const router = t.router({
      live: t.procedure.subscription(async function* () {}),
    });

    expect(() => attach(router)).toThrow(/subscriptions/);
  });

  it('registers one handler per path, and the disposer removes them all', () => {
    const detach = attach(
      t.router({ a: t.procedure.query(() => 1), b: t.router({ c: t.procedure.query(() => 2) }) }),
    );

    expect([...ipcHandlers.keys()].sort()).toEqual(['ipc:a', 'ipc:b.c']);

    detach();

    expect(ipcHandlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(2);
  });
});

describe('the app router', () => {
  afterEach(() => resetElectronMock());

  it('answers app.ping and app.version', async () => {
    attachRouter(appRouter, { createContext });

    expect(await call('app.ping')).toEqual({ ok: true, data: 'pong', changed: [] });
    expect(await call('app.version')).toEqual({ ok: true, data: '0.0.0-test', changed: [] });
  });
});
