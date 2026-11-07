import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, type TRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy, type TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppEvents } from '@common/events';
import type { IpcBridge } from '@common/ipc/types';
import type { AppRouter } from '@main/ipc/router';
import { createEventClient, type EventClient } from './events';
import { createQueryInvalidator, type QueryInvalidator } from './query-invalidator';
import { ipcLink } from './link';

// The app's client, cache and events. A component reads with
// `useQuery(trpc.app.version.queryOptions())` and writes with
// `useMutation(trpc.….mutationOptions())`; it never says what to refetch: what a call changed is
// refetched before it settles, and what changed elsewhere when main says so (./query-invalidator.ts).

export interface IpcServices {
  queryClient: QueryClient;
  events: EventClient<AppEvents>;
  queryInvalidator: QueryInvalidator;
  ipc: TRPCClient<AppRouter>;
  trpc: TRPCOptionsProxy<AppRouter>;
}

/**
 * A client, cache and event client over one bridge: the preload's by default (read at call time),
 * or a fake one in tests.
 */
export function createIpcServices(options: { bridge?: IpcBridge } = {}): IpcServices {
  const queryClient = new QueryClient({
    // a desktop app's window gains focus all the time, and main already says what changed
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
  });
  const events = createEventClient<AppEvents>({ bridge: options.bridge });
  const queryInvalidator = createQueryInvalidator({ queryClient });
  const ipc = createTRPCClient<AppRouter>({
    links: [
      ipcLink({
        bridge: options.bridge,
        onChanged: (changed) => queryInvalidator.onChanged(changed),
      }),
    ],
  });
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient });
  return { queryClient, events, queryInvalidator, ipc, trpc };
}

const services = createIpcServices();

export const { queryClient, events, queryInvalidator, ipc, trpc } = services;
