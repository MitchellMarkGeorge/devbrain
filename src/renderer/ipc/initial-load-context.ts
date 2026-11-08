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
 * Puts the context in the cache before the first render, so the workspace and settings queries
 * render with data rather than a loading state. They stay fresh until main says the registry, the
 * open workspace or the settings changed (query-invalidator.ts), so they are never refetched just
 * for mounting.
 */
export function seedQueryCache(queryClient: QueryClient, context: InitialLoadContext | null): void {
  queryClient.setQueryDefaults(trpc.workspaces.pathKey(), { staleTime: Infinity });
  queryClient.setQueryDefaults(trpc.settings.get.queryKey(), { staleTime: Infinity });
  if (context === null) return;
  queryClient.setQueryData(trpc.workspaces.current.queryKey(), context.current);
  queryClient.setQueryData(trpc.workspaces.list.queryKey(), context.workspaces);
  if (context.settings !== null) {
    queryClient.setQueryData(trpc.settings.get.queryKey(), context.settings);
  }
}
