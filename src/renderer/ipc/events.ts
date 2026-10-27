import type { IpcBridge } from '@common/ipc/types';
import { defaultBridge } from './client';

export interface EventClient<TEvents> {
  // returns the function that unsubscribes
  on<K extends keyof TEvents & string>(
    name: K,
    listener: (payload: TEvents[K]) => void,
  ): () => void;
}

// The push events main sends (AppEvents in src/common/events.ts), typed by name.
export function createEventClient<TEvents>(
  options: { bridge?: IpcBridge } = {},
): EventClient<TEvents> {
  return {
    on(name, listener) {
      const bridge = options.bridge ?? defaultBridge();
      return bridge.subscribe(name, (payload) => listener(payload as TEvents[typeof name]));
    },
  };
}
