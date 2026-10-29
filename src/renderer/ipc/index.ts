import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppEvents } from '@common/events';
import type { AppRouter } from '@main/ipc/router';
import { createEventClient } from './events';
import { createQueryInvalidator } from './query-invalidator';
import { ipcLink } from './link';

// The app's client, cache and events. A component reads with
// `useQuery(trpc.app.version.queryOptions())` and writes with
// `useMutation(trpc.….mutationOptions())`; it never says what to refetch: what a call changed is
// refetched before it settles, and what changed elsewhere when main says so (./query-invalidator.ts).

export const queryClient = new QueryClient();
export const events = createEventClient<AppEvents>();

export const queryInvalidator = createQueryInvalidator({
  queryClient,
  currentWorkspaceId: async () => (await ipc.workspaces.current.query())?.id ?? null,
});

export const ipc = createTRPCClient<AppRouter>({
  links: [ipcLink({ onChanged: (changed) => queryInvalidator.onChanged(changed) })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient });
