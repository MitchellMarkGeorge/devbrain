import type { InferSchemaInput, InferSchemaOutput, StandardSchemaV1 } from './types';

// The procedure builder: what main defines its router with. Main runs the procedures
// (src/main/ipc/server.ts); the renderer reads only their types, through `Client<AppRouter>`.
//
//   const t = initIpc<AppContext>();
//   const router = t.router({
//     get: t.procedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => …),
//   });
//
// The types the renderer reads stay structural (no classes or unique symbols): it sees main's
// declarations and its own copy of this file, which must agree.

// The context every procedure's resolver and middleware receive, built per call by attachRouter's
// `createContext`.
export type RouterContext = object;

export type ProcedureType = 'query' | 'mutation';

// T with U's keys replaced, as `next({ ctx })` merges into the context
export type Overwrite<T, U> = {
  [K in keyof T | keyof U]: K extends keyof U ? U[K] : K extends keyof T ? T[K] : never;
};

// What a middleware returns: the result of `next()`. Its type parameter is the context the rest of
// the chain was given, which is how `.use()` narrows the context.
export interface MiddlewareResult<TCtx> {
  readonly _ctx?: TCtx;
  readonly output: unknown;
}

export interface MiddlewareNext<TCtx> {
  (): Promise<MiddlewareResult<TCtx>>;
  <TAdded extends object>(opts: {
    ctx: TAdded;
  }): Promise<MiddlewareResult<Overwrite<TCtx, TAdded>>>;
}

export interface MiddlewareOptions<TCtx> {
  ctx: TCtx;
  path: string;
  type: ProcedureType;
  // runs the rest of the chain, at most once; `ctx` is merged into the context it gets. To stop
  // the call, throw instead
  next: MiddlewareNext<TCtx>;
}

export type Middleware<TCtx, TNextCtx> = (
  opts: MiddlewareOptions<TCtx>,
) => Promise<MiddlewareResult<TNextCtx>>;

export interface ResolverOptions<TCtx, TInput> {
  ctx: TCtx;
  input: TInput;
}

export type Resolver<TCtx, TInput, TOutput> = (opts: ResolverOptions<TCtx, TInput>) => TOutput;

// What the server needs to run a procedure. Middlewares are kept untyped: each one's context is
// the previous one's output, which only the builder checks.
export interface ProcedureDef {
  type: ProcedureType;
  inputSchema: StandardSchemaV1 | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  middlewares: Middleware<any, any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolver: Resolver<any, any, unknown>;
}

export interface Procedure<TType extends ProcedureType, TInput, TOutput> {
  readonly _def: ProcedureDef & { type: TType };
  // types only: what the client passes and gets back
  readonly _types?: { input: TInput; output: TOutput };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProcedure = Procedure<ProcedureType, any, any>;

export interface RouterRecord {
  [key: string]: AnyProcedure | RouterRecord;
}

export interface ProcedureBuilder<TCtx, TInput, TParsed> {
  // validates the input before the middleware runs; the client sees the schema's input type and
  // the resolver its output (defaults applied). Once per procedure
  input<S extends StandardSchemaV1>(
    schema: S,
  ): ProcedureBuilder<TCtx, InferSchemaInput<S>, InferSchemaOutput<S>>;
  use<TNextCtx>(
    middleware: Middleware<TCtx, TNextCtx>,
  ): ProcedureBuilder<TNextCtx, TInput, TParsed>;
  query<TOutput>(
    resolver: Resolver<TCtx, TParsed, TOutput>,
  ): Procedure<'query', TInput, Awaited<TOutput>>;
  // the only kind that opens a change scope (milestone 3)
  mutation<TOutput>(
    resolver: Resolver<TCtx, TParsed, TOutput>,
  ): Procedure<'mutation', TInput, Awaited<TOutput>>;
}

export function isProcedure(value: unknown): value is AnyProcedure {
  if (typeof value !== 'object' || value === null || !('_def' in value)) return false;
  const def = (value as { _def: unknown })._def;
  return (
    typeof def === 'object' && def !== null && typeof (def as ProcedureDef).resolver === 'function'
  );
}

function createBuilder<TCtx, TInput, TParsed>(
  def: Omit<ProcedureDef, 'type' | 'resolver'>,
): ProcedureBuilder<TCtx, TInput, TParsed> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (type: ProcedureType, resolver: Resolver<any, any, unknown>) => ({
    _def: { ...def, middlewares: [...def.middlewares], type, resolver },
  });
  return {
    input(schema) {
      if (def.inputSchema !== undefined) throw new Error('A procedure takes one input schema');
      return createBuilder({ ...def, inputSchema: schema });
    },
    use(middleware) {
      return createBuilder({ ...def, middlewares: [...def.middlewares, middleware] });
    },
    query(resolver) {
      return build('query', resolver) as Procedure<'query', TInput, never>;
    },
    mutation(resolver) {
      return build('mutation', resolver) as Procedure<'mutation', TInput, never>;
    },
  };
}

// A router is a plain object of procedures and nested routers; this only checks its shape.
export function createRouter<TRecord extends RouterRecord>(record: TRecord): TRecord {
  return record;
}

export interface IpcBuilder<TCtx extends RouterContext> {
  // a procedure with no input and no middleware; extend it with .input() and .use()
  procedure: ProcedureBuilder<TCtx, void, undefined>;
  router: typeof createRouter;
  // types a middleware for reuse across procedures
  middleware<TNextCtx>(middleware: Middleware<TCtx, TNextCtx>): Middleware<TCtx, TNextCtx>;
}

export function initIpc<TCtx extends RouterContext>(): IpcBuilder<TCtx> {
  return {
    procedure: createBuilder({ inputSchema: undefined, middlewares: [] }),
    router: createRouter,
    middleware: (middleware) => middleware,
  };
}
