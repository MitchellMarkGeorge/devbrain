import { createTRPCClient } from '@trpc/client';
import type { AppEvents } from '@common/events';
import type { AppRouter } from '@main/ipc/router';
import { createEventClient } from './events';
import { ipcLink } from './link';

// The app's client and events. Milestone 4 of docs/ipc/implementation-plan.md passes `onChanged`,
// which refetches what each call changed.
export const ipc = createTRPCClient<AppRouter>({ links: [ipcLink()] });
export const events = createEventClient<AppEvents>();
