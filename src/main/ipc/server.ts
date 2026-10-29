import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { callTRPCProcedure, getTRPCErrorFromUnknown, getTRPCErrorShape } from '@trpc/server';
import type { AnyTRPCRouter, inferRouterContext, TRPCError } from '@trpc/server';
import type { ChangedEntity } from '@common/changes';
import { IPC_CALL_CHANNEL } from '@common/ipc/constants';
import type { IpcErrorShape, IpcRequest, IpcResult } from '@common/ipc/types';
import { IpcError } from './errors';

// tRPC's router behind ipcMain, on one channel: each request names its procedure, which tRPC finds,
// validates the input for, and runs with its middleware. This only carries the call and its
// `changed` across IPC, answering with an IpcResult envelope. Modelled on electron-trpc, without
// subscriptions, so a call is one invoke and needs no request ids.

export interface ChangeRecorder {
  record(...entities: ChangedEntity[]): void;
}

// Runs each call so that what it changes reaches its recorder: the ChangeHub (./changes.ts) adds
// core's changes. `run` builds the context with the recorder it is given.
export interface CallTracker {
  track<T>(
    origin: IpcMainInvokeEvent['sender'],
    changes: ChangeRecorder,
    run: (changes: ChangeRecorder) => Promise<T>,
  ): Promise<T>;
}

export interface IpcErrorInfo {
  path: string;
  // what tRPC caught: what the resolver threw is its `cause`
  error: TRPCError;
  shape: IpcErrorShape;
}

export interface AttachRouterOptions<TRouter extends AnyTRPCRouter> {
  // read on every call; typed from the router, so it must build the context its procedures use
  createContext: (opts: {
    event: IpcMainInvokeEvent;
    changes: ChangeRecorder;
  }) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
  // every failed call, to log; it never changes the response
  onError?: (info: IpcErrorInfo) => void;
  // without one, a call's `changed` is only what its resolver records
  tracker?: CallTracker;
}

// Registers the call handler. Returns the function that removes it.
export function attachRouter<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  options: AttachRouterOptions<TRouter>,
): () => void {
  const execute = async (
    event: IpcMainInvokeEvent,
    { path, type, input }: IpcRequest,
  ): Promise<IpcResult<unknown>> => {
    const changed = new Set<ChangedEntity>();
    const changes: ChangeRecorder = {
      record: (...entities) => entities.forEach((entity) => changed.add(entity)),
    };
    let ctx: inferRouterContext<TRouter> | undefined;
    try {
      // the request comes from the renderer, which is not trusted: tRPC would start a subscription,
      // and answers any other unknown path or type with NOT_FOUND
      if (type !== 'query' && type !== 'mutation') {
        throw new IpcError('internal', 'Only queries and mutations run over IPC');
      }
      const run = async (recorder: ChangeRecorder): Promise<unknown> => {
        ctx = await options.createContext({ event, changes: recorder });
        return callTRPCProcedure({
          router,
          path,
          type,
          ctx,
          getRawInput: async () => input,
          signal: undefined,
          batchIndex: 0,
        });
      };
      const data = await (options.tracker
        ? options.tracker.track(event.sender, changes, run)
        : run(changes));
      return { ok: true, data, changed: [...changed] };
    } catch (cause) {
      const error = getTRPCErrorFromUnknown(cause);
      const shape = getTRPCErrorShape({
        config: router._def._config,
        error,
        type,
        path,
        input,
        ctx,
      }) as IpcErrorShape;
      options.onError?.({ path, error, shape });
      return { ok: false, error: shape, changed: [...changed] };
    }
  };

  ipcMain.handle(IPC_CALL_CHANNEL, (event, request: IpcRequest | null | undefined) =>
    execute(event, request ?? { path: '', type: 'query', input: undefined }),
  );

  return () => ipcMain.removeHandler(IPC_CALL_CHANNEL);
}
