import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { Client, inferInput, inferOutput } from '@common/ipc/client-types';
import { initIpc, isProcedure } from '@common/ipc/procedure';
import type { ResolverOptions } from '@common/ipc/procedure';

interface Ctx {
  user: { id: string } | null;
  log: string[];
}

const t = initIpc<Ctx>();

describe('the procedure builder', () => {
  it('gives the client the schema input and the resolver the parsed output', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
    const procedure = t.procedure
      .input(z.object({ id: z.string(), limit: z.number().default(10) }))
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ id: string; limit: number }>();
        return { id: input.id, at: new Date() };
      });

    expectTypeOf<inferInput<typeof procedure>>().toEqualTypeOf<{ id: string; limit?: number }>();
    expectTypeOf<inferOutput<typeof procedure>>().toEqualTypeOf<{ id: string; at: Date }>();
  });

  it('unwraps an async resolver output', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
    const procedure = t.procedure.mutation(async () => 42);

    expectTypeOf<inferOutput<typeof procedure>>().toEqualTypeOf<number>();
  });

  it('takes no input when no schema is given', () => {
    t.procedure.query(({ input }) => {
      expectTypeOf(input).toEqualTypeOf<undefined>();
      return null;
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
    const router = t.router({ ping: t.procedure.query(() => 'pong') });

    expectTypeOf<Client<typeof router>['ping']>().toBeCallableWith();
    expectTypeOf<Client<typeof router>['ping']>().toBeCallableWith(undefined);
  });

  it('requires an input unless the schema accepts undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
    const router = t.router({
      get: t.procedure.input(z.object({ id: z.string() })).query(() => null),
      list: t.procedure.input(z.object({ limit: z.number() }).optional()).query(() => null),
    });
    type C = Client<typeof router>;

    expectTypeOf<Parameters<C['get']>[0]>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<C['list']>().toBeCallableWith();
    // @ts-expect-error: the input is required
    expectTypeOf<C['get']>().toBeCallableWith();
  });

  it('narrows the context through .use()', () => {
    const authed = t.procedure.use(({ ctx, next }) => {
      if (ctx.user === null) throw new Error('signed out');
      return next({ ctx: { user: ctx.user } });
    });

    authed.query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{ user: { id: string }; log: string[] }>();
      return null;
    });
    // a middleware that only calls next() leaves the context as it was
    t.procedure
      .use(({ next }) => next())
      .query((opts) => {
        expectTypeOf(opts).toEqualTypeOf<ResolverOptions<Ctx, undefined>>();
        return null;
      });
  });

  it('maps a nested router to a client of the same shape', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type
    const router = t.router({
      app: t.router({ version: t.procedure.query(() => '1.0.0') }),
    });

    expectTypeOf<Client<typeof router>['app']['version']>().returns.toEqualTypeOf<
      Promise<string>
    >();
  });

  it('builds immutably: extending a base procedure leaves it as it was', () => {
    const base = t.procedure.use(({ next }) => next());
    const withInput = base.input(z.string());

    expect(base.query(() => null)._def.inputSchema).toBeUndefined();
    expect(withInput.query(() => null)._def.inputSchema).toBeDefined();
    expect(base.use(({ next }) => next()).query(() => null)._def.middlewares).toHaveLength(2);
    expect(base.query(() => null)._def.middlewares).toHaveLength(1);
  });

  it('takes one input schema', () => {
    expect(() => t.procedure.input(z.string()).input(z.number())).toThrow(/one input schema/);
  });

  it('tells procedures from routers', () => {
    expect(isProcedure(t.procedure.query(() => null))).toBe(true);
    expect(isProcedure(t.router({}))).toBe(false);
    expect(isProcedure({ _def: {} })).toBe(false);
  });
});
