import type { QueryClient } from '@tanstack/react-query';
import type { IpcBridge } from '@common/ipc/types';
import type { InitialLoadContext } from '@common/ipc/types';
import { defaultBridge } from './bridge';
import { trpc } from './index';

export type { InitialLoadContext };

/**
 * Main's initial load context for this page load (src/main/ipc/initial-load-context.ts), or null
 * when there is none: main could not build one, or there is no bridge. With none, the page fetches
 * what it shows.
 */
export function readInitialLoadContext(bridge?: IpcBridge): InitialLoadContext | null {
  try {
    return ((bridge ?? defaultBridge()).initialLoadContext as InitialLoadContext | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Puts the context in the cache before the first render, so the workspace queries render with
 * data rather than a loading state. They stay fresh until main says the registry or the open
 * workspace changed (query-invalidator.ts), so they are never refetched just for mounting. The last
 * page is there too, so boot can pick the landing page without waiting for a call.
 */
export function seedQueryCache(queryClient: QueryClient, context: InitialLoadContext | null): void {
  queryClient.setQueryDefaults(trpc.workspaces.pathKey(), { staleTime: Infinity });
  if (context === null) return;
  queryClient.setQueryData(trpc.workspaces.current.queryKey(), context.current);
  queryClient.setQueryData(trpc.workspaces.list.queryKey(), context.workspaces);
  queryClient.setQueryData(trpc.settings.lastPage.queryKey(), context.lastPage);
}
