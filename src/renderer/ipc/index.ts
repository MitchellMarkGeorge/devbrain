import { createTRPCClient } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppEvents } from '@common/events';
import type { AppRouter } from '@main/ipc/router';
import { applyChanges } from '../data/changes';
import { queryClient } from '../data/queryClient';
import { createEventClient } from './events';
import { ipcLink } from './link';

// The app's client: each call settles once what it changed has been refetched (../data/changes).
export const ipc = createTRPCClient<AppRouter>({ links: [ipcLink({ onChanged: applyChanges })] });
// React Query's options per route: `trpc.tasks.get.queryOptions(input)`, `.mutationOptions()`,
// `.queryKey()`, and `pathKey()` per router
export const trpc = createTRPCOptionsProxy<AppRouter>({ client: ipc, queryClient });
export const events = createEventClient<AppEvents>();
