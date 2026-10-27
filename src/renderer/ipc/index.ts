import type { AppEvents } from '@common/events';
import type { AppRouter } from '@main/ipc/router';
import { createClient } from './client';
import { createEventClient } from './events';

// The app's client and events. Milestone 4 of docs/ipc/implementation-plan.md passes `onChanged`,
// which refetches what each call changed.
export const ipc = createClient<AppRouter>();
export const events = createEventClient<AppEvents>();
