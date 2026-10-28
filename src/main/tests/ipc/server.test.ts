import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { TRPCError } from '@trpc/server';
import { IpcError } from '@main/ipc/errors';
import type { IpcResult } from '@common/ipc/types';
import { RateLimitError } from '@main/core/shared/errors';
import { attachRouter } from '@main/ipc/server';
import type { IpcErrorInfo } from '@main/ipc/server';
import { appRouter } from '@main/ipc/router';
import { t } from '@main/ipc/trpc';
import { openScope } from '@main/ipc/changes/scope';
import { invokeHandler, ipcHandlers, resetElectronMock } from '../__mocks__/electron';
import { testContext } from './helpers';

const event = {} as IpcMainInvokeEvent;

function call(path: string, input?: unknown, type: 'query' | 'mutation' = 'query') {
  return invokeHandler('ipc:call', event, { path, type, input }) as Promise<IpcResult<unknown>>;
}

function attach(
  router: Parameters<typeof attachRouter>[0],
  options: { onError?: (info: IpcErrorInfo) => void } = {},
) {
  return attachRouter(router, { createContext: testContext(), ...options });
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

    expect(await call('sync', undefined, 'mutation')).toMatchObject({
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

    expect(await call('save', undefined, 'mutation')).toMatchObject({ ok: true, data: 'grace' });
    expect(order).toEqual(['first save mutation', 'second grace', 'resolver', 'first after']);
  });

  // the ChangeRouter records core's changes into the open scope, as these do
  it("returns what was recorded in a mutation's scope, on success and on failure", async () => {
    let scopeInQuery: unknown = 'unset';
    attach(
      t.router({
        archive: t.procedure.mutation(() => {
          openScope()?.record('task', 'note', 'task');
          return null;
        }),
        failsAfterWriting: t.procedure.mutation(() => {
          openScope()?.record('task');
          throw new Error('after the commit');
        }),
        read: t.procedure.query(() => {
          scopeInQuery = openScope();
          return null;
        }),
      }),
    );

    expect(await call('archive', undefined, 'mutation')).toEqual({
      ok: true,
      data: null,
      changed: ['task', 'note'],
    });
    expect(await call('failsAfterWriting', undefined, 'mutation')).toMatchObject({
      ok: false,
      changed: ['task'],
    });
    // a query opens none
    expect(await call('read')).toEqual({ ok: true, data: null, changed: [] });
    expect(scopeInQuery).toBeUndefined();
  });

  it('answers an unknown path, a wrong type and a malformed request with internal', async () => {
    const onError = vi.fn();
    attach(
      t.router({
        get: t.procedure.query(() => 1),
        live: t.procedure.subscription(async function* () {}),
      }),
      { onError },
    );
    const internal = { ok: false, error: { data: { code: 'internal' } } };

    expect(await call('nope')).toMatchObject(internal);
    expect(await call('get', undefined, 'mutation')).toMatchObject(internal);
    expect(await call('live')).toMatchObject(internal);
    expect(await invokeHandler('ipc:call', event, 'app.ping')).toMatchObject(internal);
    expect(await invokeHandler('ipc:call', event, null)).toMatchObject(internal);
    expect(onError.mock.calls[0][0].error.code).toBe('NOT_FOUND');
  });

  it('registers one handler, and the disposer removes it', () => {
    const detach = attach(t.router({ a: t.procedure.query(() => 1) }));

    expect([...ipcHandlers.keys()]).toEqual(['ipc:call']);

    detach();

    expect(ipcHandlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('ipc:call');
  });
});

describe('the app router', () => {
  afterEach(() => resetElectronMock());

  it('answers app.ping and app.version', async () => {
    attachRouter(appRouter, { createContext: testContext() });

    expect(await call('app.ping')).toEqual({ ok: true, data: 'pong', changed: [] });
    expect(await call('app.version')).toEqual({ ok: true, data: '0.0.0-test', changed: [] });
  });
});
