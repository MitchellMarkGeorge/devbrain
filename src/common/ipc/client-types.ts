import type { AnyProcedure, Procedure, ProcedureType, RouterRecord } from './procedure';

export type inferInput<TProcedure> =
  TProcedure extends Procedure<ProcedureType, infer TInput, unknown> ? TInput : never;
export type inferOutput<TProcedure> =
  TProcedure extends Procedure<ProcedureType, unknown, infer TOutput> ? TOutput : never;

export interface CallOptions {
  // aborting cancels the call in main, whose resolver sees it on its own `signal`
  signal?: AbortSignal;
}

// A procedure as the renderer calls it. The input may be left out when the procedure takes none,
// or when its schema accepts undefined.
export type ProcedureCall<TInput, TOutput> = undefined extends TInput
  ? (input?: TInput, options?: CallOptions) => Promise<TOutput>
  : (input: TInput, options?: CallOptions) => Promise<TOutput>;

// The renderer's view of a router: the same tree, with each procedure a function.
export type Client<TRouter extends RouterRecord> = {
  [K in keyof TRouter]: TRouter[K] extends AnyProcedure
    ? ProcedureCall<inferInput<TRouter[K]>, inferOutput<TRouter[K]>>
    : TRouter[K] extends RouterRecord
      ? Client<TRouter[K]>
      : never;
};
