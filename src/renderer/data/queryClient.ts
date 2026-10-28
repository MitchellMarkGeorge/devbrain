import { QueryClient } from '@tanstack/react-query';

// The app's one cache. Data stays current through invalidation (./changes.ts), not polling or
// focus: every change core makes is reported, by a mutation's response or a `db.changes` event.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // calls go to the main process, not a network: a failure is the answer, and retrying it
      // gives the same one
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
