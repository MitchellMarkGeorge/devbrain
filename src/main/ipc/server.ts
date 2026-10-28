import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { callTRPCProcedure, getTRPCErrorFromUnknown, getTRPCErrorShape } from '@trpc/server';
import type { AnyTRPCRouter, inferRouterContext, TRPCError } from '@trpc/server';
import type { ChangedEntity } from '@common/changes';
import { IPC_CHANNEL_PREFIX, IPC_NAME_PATTERN } from '@common/ipc/constants';
import { IpcError } from '@common/ipc/errors';
import type { IpcErrorShape, IpcResult } from '@common/ipc/types';

// tRPC's router behind ipcMain: one handler per procedure, on `ipc:<path>`, answering with an
// IpcResult envelope. tRPC validates the input, runs the middleware and the resolver; this only
// carries the call and its `changed` across IPC.

export interface ChangeRecorder {
  record(...entities: ChangedEntity[]): void;
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
  // checks each result can be sent (structuredClone) and fails naming the path if not, rather
  // than with Electron's own error. For development: it clones every result once more
  checkClone?: boolean;
}

// Registers a handler per procedure. Returns the function that removes them.
export function attachRouter<TRouter extends AnyTRPCRouter>(
  router: TRouter,
  options: AttachRouterOptions<TRouter>,
): () => void {
  const channels: string[] = [];

  for (const [path, procedure] of Object.entries(router._def.procedures)) {
    const { type } = (procedure as { _def: { type: 'query' | 'mutation' | 'subscription' } })._def;
    if (type === 'subscription') throw new Error(`'${path}': subscriptions don't run over IPC`);
    if (!IPC_NAME_PATTERN.test(path)) throw new Error(`'${path}': the preload rejects this path`);

    const channel = `${IPC_CHANNEL_PREFIX}${path}`;
    ipcMain.handle(channel, async (event, input: unknown): Promise<IpcResult<unknown>> => {
      const changed = new Set<ChangedEntity>();
      const changes: ChangeRecorder = {
        record: (...entities) => entities.forEach((entity) => changed.add(entity)),
      };
      let ctx: inferRouterContext<TRouter> | undefined;
      try {
        ctx = await options.createContext({ event, changes });
        const data: unknown = await callTRPCProcedure({
          router,
          path,
          type,
          ctx,
          getRawInput: async () => input,
          signal: undefined,
          batchIndex: 0,
        });
        if (options.checkClone) checkClone(path, data);
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
    });
    channels.push(channel);
  }

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

function checkClone(path: string, output: unknown): void {
  try {
    structuredClone(output);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // an IpcError keeps its message, so the path reaches the renderer's console
    throw new IpcError('internal', `'${path}' returned a value IPC can't send: ${reason}`);
  }
}
