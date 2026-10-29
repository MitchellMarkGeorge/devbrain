import type { ChangedEntity } from '../changes';
import type { CoreErrorCode } from '../errors';

// Every error code a call can fail with: core's own, and the IPC layer's.
export type IpcErrorCode =
  | CoreErrorCode
  // the route needs a workspace and none is open
  | 'no_workspace_open'
  // DevBrain failed to start, so nothing that needs it can run
  | 'devbrain_unavailable'
  // anything not thrown on purpose; its message is generic
  | 'internal';

// An error as it crosses IPC: a code to switch on, a message fit to show, and the error's own
// fields (a CoreError's `retryAt`, `integrationId`, …, or the issues of a failed validation).
export interface SerializedError {
  code: IpcErrorCode;
  message: string;
  data: Record<string, unknown>;
}

// A failure as tRPC's client reads it (its error shape): the tRPC code, and our serialized error as
// `data`, put there by the router's errorFormatter (src/main/ipc/trpc.ts).
export interface IpcErrorShape {
  code: number;
  message: string;
  data: SerializedError;
}

// What every procedure's channel answers with. `changed` lists the kinds of rows the call changed,
// on failure too, so the renderer refetches whatever did commit.
export type IpcResult<T> =
  | { ok: true; data: T; changed: ChangedEntity[] }
  | { ok: false; error: IpcErrorShape; changed: ChangedEntity[] };

// One call, as the renderer sends it on IPC_CALL_CHANNEL: tRPC's operation, without what IPC
// doesn't need. Subscriptions don't run over IPC
export interface IpcRequest {
  path: string;
  type: 'query' | 'mutation';
  input: unknown;
}

// What the preload exposes on `window` (IPC_BRIDGE_KEY). Generic: nothing in it is per route.
export interface IpcBridge {
  invoke(request: IpcRequest): Promise<IpcResult<unknown>>;
  // returns the function that unsubscribes
  subscribe(name: string, listener: (payload: unknown) => void): () => void;
}
