import { TRPCClientError } from '@trpc/client';
import type { TRPCLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { ChangedEntity } from '@common/changes';
import type { IpcBridge } from '@common/ipc/types';
import { defaultBridge } from './bridge';

export interface IpcLinkOptions {
  // given each call's `changed`, success or failure; the call settles once it does, so what it
  // changed is refetched before the caller sees the result. A call made with the context
  // `{ awaitChanges: false }` (a note's autosave) settles without waiting
  onChanged?: (changed: ChangedEntity[]) => void | Promise<void>;
  // where a failed onChanged that nothing waited on goes; the console by default
  onError?: (error: unknown) => void;
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
          const bridge = options.bridge ?? defaultBridge();
          const result = await bridge.invoke({ path: op.path, type: op.type, input: op.input });
          if (op.context.awaitChanges === false) {
            Promise.resolve()
              .then(() => options.onChanged?.(result.changed))
              .catch(options.onError ?? ((error: unknown) => console.error(error)));
          } else {
            await options.onChanged?.(result.changed);
          }
          if (!result.ok) throw TRPCClientError.from({ error: result.error });
          observer.next({ result: { type: 'data', data: result.data } });
          observer.complete();
        };
        // run is async, so its failures are a rejection: pass each to tRPC as a TRPCClientError,
        // or the call would never settle. Covers no bridge, a request or result Electron could not
        // send, onChanged throwing, and an error envelope (already a TRPCClientError, kept as is)
        run().catch((error: unknown) => observer.error(TRPCClientError.from(error as Error)));
      });
}
