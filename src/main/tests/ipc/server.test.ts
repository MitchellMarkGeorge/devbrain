import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { TRPCError } from '@trpc/server';
import { IpcError } from '@main/ipc/errors';
import type { ChangedEntity } from '@common/changes';
import type { IpcResult } from '@common/ipc/types';
import { RateLimitError } from '@main/core/shared/errors';
import type { ChangeTracker } from '@main/ipc/changes';
import { attachRouter } from '@main/ipc/server';
import { appRouter } from '@main/ipc/router';
import { t } from '@main/ipc/trpc';
import { invokeHandler, ipcHandlers, resetElectronMock } from '../__mocks__/electron';
import { testContext } from './helpers';

const event = {} as IpcMainInvokeEvent;

function call(path: string, input?: unknown, type: 'query' | 'mutation' = 'query') {
  return invokeHandler('ipc:call', event, { path, type, input }) as Promise<IpcResult<unknown>>;
}

function attach(
  router: Parameters<typeof attachRouter>[0],
  options: Omit<Parameters<typeof attachRouter>[1], 'createContext'> = {},
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

  it('returns what the change tracker heard during a mutation, on success and on failure', async () => {
    // stands in for ChangeTracker: whatever a resolver calls `write` with, core announced
    let onChange: ((entities: ChangedEntity[]) => void) | null = null;
    const write = (...entities: ChangedEntity[]) => onChange?.(entities);
    let tracked = 0;
    const changeTracker: Pick<ChangeTracker, 'track'> = {
      async track(_origin, listener, run) {
        tracked += 1;
        onChange = listener;
        try {
          return await run();
        } finally {
          onChange = null;
        }
      },
    };
    attach(
      t.router({
        archive: t.procedure.mutation(() => {
          write('task', 'note');
          write('task');
          return null;
        }),
        failsAfterWriting: t.procedure.mutation(() => {
          write('task');
          throw new Error('after the commit');
        }),
        list: t.procedure.query(() => []),
      }),
      { changeTracker },
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
    // a query changes nothing, so it is not tracked
    expect(await call('list')).toEqual({ ok: true, data: [], changed: [] });
    expect(tracked).toBe(2);
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
