import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { initIpc } from '@common/ipc/procedure';
import type { IpcResult } from '@common/ipc/types';
import { RateLimitError } from '@main/core/shared/errors';
import { attachRouter, flatten } from '@main/ipc/server';
import type { IpcErrorInfo } from '@main/ipc/server';
import { appRouter } from '@main/ipc/router';
import { createContext } from '@main/ipc/context';
import { invokeHandler, ipcHandlers, resetElectronMock } from '../__mocks__/electron';

interface Ctx {
  user: string | null;
  log: string[];
}

const t = initIpc<Ctx>();

function eventFrom(senderId: number): IpcMainInvokeEvent {
  return { sender: { id: senderId } } as IpcMainInvokeEvent;
}

const event = eventFrom(1);

function call(path: string, input?: unknown, requestId = 'req-1', from = event) {
  return invokeHandler(`ipc:${path}`, from, input, requestId) as Promise<IpcResult<unknown>>;
}

function attach(
  router: Parameters<typeof attachRouter>[0],
  options: {
    ctx?: Partial<Ctx>;
    checkClone?: boolean;
    onError?: (info: IpcErrorInfo) => void;
  } = {},
) {
  return attachRouter(router, {
    createContext: () => ({ user: 'ada', log: [], ...options.ctx }),
    onError: options.onError,
    checkClone: options.checkClone,
  });
}

// resolves once the test calls `release`, for calls that must still be running
function gate() {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => (release = resolve));
  return { opened, release };
}

describe('flatten', () => {
  it('lists procedures by dotted path', () => {
    const procedure = t.procedure.query(() => null);
    const paths = flatten(
      t.router({ app: t.router({ ping: procedure, deep: t.router({ x: procedure }) }) }),
    );

    expect([...paths.keys()]).toEqual(['app.ping', 'app.deep.x']);
  });

  it.each([
    'then',
    'queryKey',
    'pathKey',
    'queryOptions',
    'infiniteQueryOptions',
    'mutationOptions',
  ])("throws on the reserved segment '%s'", (key) => {
    const router = t.router({ tasks: t.router({ [key]: t.procedure.query(() => null) }) });

    expect(() => flatten(router)).toThrow(/reserved/);
  });

  it('throws on a reserved name used for a router too', () => {
    const router = t.router({ then: t.router({ x: t.procedure.query(() => null) }) });

    expect(() => flatten(router)).toThrow(/reserved/);
  });

  it('throws on a key with a dot, which would define a nested path twice', () => {
    const procedure = t.procedure.query(() => null);
    const router = t.router({ a: t.router({ b: procedure }), 'a.b': procedure });

    expect(() => flatten(router)).toThrow(/letters, digits/);
  });

  it('throws on a top-level cancel, the cancel channel', () => {
    expect(() => flatten(t.router({ cancel: t.procedure.query(() => null) }))).toThrow(/cancel/);
    expect(() =>
      flatten(t.router({ sync: t.router({ cancel: t.procedure.query(() => null) }) })),
    ).not.toThrow();
  });
});

describe('attachRouter', () => {
  afterEach(() => resetElectronMock());

  it('answers a query with its data and no changes', async () => {
    attach(t.router({ app: t.router({ ping: t.procedure.query(() => 'pong') }) }));

    expect(await call('app.ping')).toEqual({ ok: true, data: 'pong', changed: [] });
  });

  it('gives the resolver the parsed input and the context', async () => {
    const resolver = vi.fn(({ ctx, input }: { ctx: Ctx; input: { limit: number } }) => ({
      user: ctx.user,
      limit: input.limit,
    }));
    attach(
      t.router({
        list: t.procedure.input(z.object({ limit: z.number().default(10) })).query(resolver),
      }),
    );

    expect(await call('list', {})).toEqual({
      ok: true,
      data: { user: 'ada', limit: 10 },
      changed: [],
    });
  });

  it('answers invalid_input with the issues, without running the resolver', async () => {
    const resolver = vi.fn(() => null);
    attach(t.router({ get: t.procedure.input(z.object({ id: z.string() })).query(resolver) }));

    const result = await call('get', { id: 42 });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_input',
        data: { issues: [{ path: ['id'], message: expect.any(String) }] },
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

    expect(await call('sync')).toEqual({
      ok: false,
      error: { code: 'rate_limited', message: expect.stringContaining('2026'), data: { retryAt } },
      changed: [],
    });
  });

  it('answers internal for anything else, and reports the original to onError', async () => {
    const onError = vi.fn();
    const thrown = new Error('database is locked');
    attach(
      t.router({
        broken: t.procedure.query(async () => {
          throw thrown;
        }),
      }),
      { onError },
    );

    expect(await call('broken')).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Something went wrong', data: {} },
      changed: [],
    });
    expect(onError).toHaveBeenCalledWith({
      path: 'broken',
      type: 'query',
      error: thrown,
      serialized: expect.objectContaining({ code: 'internal' }),
    });
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

  it('stops at a middleware that throws', async () => {
    const later = vi.fn(({ next }) => next());
    const resolver = vi.fn(() => null);
    const procedure = t.procedure
      .use(({ ctx, next }) => {
        if (ctx.user === null) throw new RateLimitError(new Date(0));
        return next();
      })
      .use(later)
      .query(resolver);
    attach(t.router({ guarded: procedure }), { ctx: { user: null } });

    expect(await call('guarded')).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
    expect(later).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });

  it('fails a call whose middleware calls next() twice', async () => {
    const resolver = vi.fn(() => null);
    const onError = vi.fn();
    const procedure = t.procedure
      .use(async ({ next }) => {
        await next();
        return next();
      })
      .query(resolver);
    attach(t.router({ twice: procedure }), { onError });

    expect(await call('twice')).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].error.message).toMatch(/next\(\) twice/);
  });

  it('aborts the call with the request id cancelled, and answers cancelled', async () => {
    const started = gate();
    attach(
      t.router({
        connect: t.procedure.mutation(
          ({ signal }) =>
            new Promise((_resolve, reject) => {
              started.release();
              signal.addEventListener('abort', () => reject(new Error('aborted by signal')));
            }),
        ),
      }),
    );

    const pending = call('connect', undefined, 'req-7');
    await started.opened;
    await invokeHandler('ipc:cancel', event, 'req-7');

    expect(await pending).toEqual({
      ok: false,
      error: { code: 'cancelled', message: 'The call was cancelled', data: {} },
      changed: [],
    });
  });

  it("only cancels the sender's own call", async () => {
    const started = gate();
    const signals: AbortSignal[] = [];
    attach(
      t.router({
        wait: t.procedure.query(async ({ signal }) => {
          signals.push(signal);
          await started.opened;
          return signal.aborted;
        }),
      }),
    );

    const pending = call('wait', undefined, 'req-1', eventFrom(1));
    await invokeHandler('ipc:cancel', eventFrom(2), 'req-1');
    await invokeHandler('ipc:cancel', event, 'other');
    started.release();

    expect(await pending).toMatchObject({ ok: true, data: false });
  });

  it('keeps the result of a resolver that finished despite the abort', async () => {
    const started = gate();
    const finish = gate();
    attach(
      t.router({
        save: t.procedure.mutation(async () => {
          started.release();
          await finish.opened;
          return 'saved';
        }),
      }),
    );

    const pending = call('save', undefined, 'req-2');
    await started.opened;
    await invokeHandler('ipc:cancel', event, 'req-2');
    finish.release();

    expect(await pending).toMatchObject({ ok: true, data: 'saved' });
  });

  it('with checkClone, fails a result IPC cannot send, naming the path', async () => {
    attach(t.router({ app: t.router({ fn: t.procedure.query(() => ({ run: () => 1 })) }) }), {
      checkClone: true,
    });

    const result = await call('app.fn');

    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } });
    expect(!result.ok && result.error.message).toMatch(/'app\.fn' returned a value IPC can't send/);
  });

  it('without checkClone, leaves the result to Electron', async () => {
    attach(t.router({ fn: t.procedure.query(() => ({ run: () => 1 })) }));

    expect(await call('fn')).toMatchObject({ ok: true });
  });

  it('registers one handler per path plus cancel, and the disposer removes them all', () => {
    const detach = attach(
      t.router({ a: t.procedure.query(() => 1), b: t.router({ c: t.procedure.query(() => 2) }) }),
    );

    expect([...ipcHandlers.keys()].sort()).toEqual(['ipc:a', 'ipc:b.c', 'ipc:cancel']);

    detach();

    expect(ipcHandlers.size).toBe(0);
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
  });

  it('aborts the calls still running when detached', async () => {
    const started = gate();
    const detach = attach(
      t.router({
        wait: t.procedure.query(
          ({ signal }) =>
            new Promise((_resolve, reject) => {
              started.release();
              signal.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        ),
      }),
    );

    const pending = call('wait');
    await started.opened;
    detach();

    expect(await pending).toMatchObject({ ok: false, error: { code: 'cancelled' } });
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
