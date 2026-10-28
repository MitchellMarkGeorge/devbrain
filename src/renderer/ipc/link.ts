import { TRPCClientError } from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { ChangedEntity } from '@common/changes';
import type { IpcBridge, IpcResult } from '@common/ipc/types';
import { defaultBridge } from './bridge';

export interface IpcLinkOptions {
  // given each call's `changed`, success or failure; the call settles once it does, so what it
  // changed is refetched before the caller sees the result
  onChanged?: (changed: ChangedEntity[]) => void | Promise<void>;
  // the preload's bridge, read at call time by default; tests pass their own
  bridge?: IpcBridge;
}

// tRPC's transport over the preload bridge: each call is one invoke on IPC_CALL_CHANNEL
// (src/main/ipc/server.ts), whose IpcResult envelope it unwraps.
export function ipcLink<TRouter extends AnyTRPCRouter>(
  options: IpcLinkOptions = {},
): TRPCLink<TRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const run = async () => {
          if (op.type === 'subscription') {
            throw new TRPCClientError("Subscriptions don't run over IPC");
          }
          let result: IpcResult<unknown>;
          try {
            const bridge = options.bridge ?? defaultBridge();
            result = await bridge.invoke({ path: op.path, type: op.type, input: op.input });
          } catch (error) {
            // no bridge, or a request or result Electron could not clone
            throw TRPCClientError.from(error instanceof Error ? error : new Error(String(error)));
          }
          await options.onChanged?.(result.changed);
          if (!result.ok) throw TRPCClientError.from({ error: result.error });
          observer.next({ result: { type: 'data', data: result.data } });
          observer.complete();
        };
        run().catch((error: unknown) => observer.error(TRPCClientError.from(error as Error)));
      });
}
