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

// No refetch on window focus: main says what changed (./query-invalidator.ts), so focusing the
// window never makes data stale, and the window's focus also starts a sync in main, whose writes
// arrive as changes.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});
export const events = createEventClient<AppEvents>();

export const queryInvalidator = createQueryInvalidator({ queryClient });

export const ipc = createTRPCClient<AppRouter>({
  links: [ipcLink({ onChanged: (changed) => queryInvalidator.onChanged(changed) })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient });
