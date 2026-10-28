import type { ChangedEntity } from '../changes';
import type { CoreErrorCode } from '../errors';

// Every error code a call can fail with: core's own, and the IPC layer's.
export type IpcErrorCode =
  | CoreErrorCode
  // the route needs a workspace and none is open
  | 'no_workspace_open'
  // DevBrain failed to start, so nothing that needs it can run
  | 'devbrain_unavailable'
  // the user cancelled what the call was waiting on: an OAuth sign-in, through
  // integrations.cancelConnect
  | 'cancelled'
  // anything not thrown on purpose; its message is generic
  | 'internal';

// An error as it crosses IPC: a code to switch on, a message fit to show, and the error's own
// fields (a CoreError's `retryAt`, `integrationId`, …, or the issues of a failed validation).
export interface SerializedError {
  code: IpcErrorCode;
  message: string;
  data: Record<string, unknown>;
}

// What every procedure's channel answers with. `changed` lists the kinds of rows the call changed,
// on failure too, so the renderer refetches whatever did commit.
export type IpcResult<T> =
  | { ok: true; data: T; changed: ChangedEntity[] }
  | { ok: false; error: SerializedError; changed: ChangedEntity[] };

// What the preload exposes on `window` (IPC_BRIDGE_KEY). Generic: nothing in it is per route.
export interface IpcBridge {
  invoke(path: string, input: unknown): Promise<IpcResult<unknown>>;
  // returns the function that unsubscribes
  subscribe(name: string, listener: (payload: unknown) => void): () => void;
}

// Standard Schema v1 (https://standardschema.dev), inlined as its spec recommends rather than
// added as a dependency. Zod v4 schemas implement it.
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
  readonly types?: StandardSchemaTypes<Input, Output> | undefined;
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export interface StandardSchemaTypes<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

export type InferSchemaInput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['input'];
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['output'];
