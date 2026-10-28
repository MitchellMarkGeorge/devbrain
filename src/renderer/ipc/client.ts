import type { ChangedEntity } from '@common/changes';
import type { Client } from '@common/ipc/client-types';
import { IPC_BRIDGE_KEY } from '@common/ipc/constants';
import { IpcError } from '@common/ipc/errors';
import type { RouterRecord } from '@common/ipc/procedure';
import type { IpcBridge, IpcResult } from '@common/ipc/types';

export interface ClientOptions {
  // given each call's `changed`, success or failure; the call settles once it does, so what it
  // changed is refetched before the caller sees the result
  onChanged?: (changed: ChangedEntity[]) => void | Promise<void>;
  // the preload's bridge, read at call time by default; tests pass their own
  bridge?: IpcBridge;
}

// window.ipcBridge, read when a call is made: there is no window when a test imports this
export function defaultBridge(): IpcBridge {
  return (globalThis as unknown as Record<string, IpcBridge>)[IPC_BRIDGE_KEY];
}

// The typed client: `client.tasks.get({ id })` invokes `tasks.get`. Built with a proxy, so nothing
// in it is per route.
export function createClient<TRouter extends RouterRecord>(
  options: ClientOptions = {},
): Client<TRouter> {
  const bridge = () => options.bridge ?? defaultBridge();

  const call = async (path: string, input: unknown) => {
    let result: IpcResult<unknown>;
    try {
      result = await bridge().invoke(path, input);
    } catch (error) {
      // no handler for the path, or a result Electron could not clone
      const message = error instanceof Error ? error.message : String(error);
      throw new IpcError('internal', message, {}, { cause: error });
    }

    await options.onChanged?.(result.changed);
    if (result.ok) return result.data;
    throw IpcError.fromSerialized(result.error);
  };

  return createNode(call, []) as Client<TRouter>;
}

type Call = (path: string, input: unknown) => Promise<unknown>;

function createNode(call: Call, path: readonly string[]): unknown {
  // a function, so the node can be called as well as read from
  return new Proxy(() => {}, {
    get(_target, key) {
      // `then`: awaiting a router node must not treat it as a promise and hang. Symbols: inspection
      // (Symbol.toPrimitive, Symbol.iterator, …)
      if (typeof key === 'symbol' || key === 'then') return undefined;
      return createNode(call, [...path, key]);
    },
    apply(_target, _this, args: unknown[]) {
      return call(path.join('.'), args[0]);
    },
  });
}
