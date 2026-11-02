import type { QueryClient } from '@tanstack/react-query';
import type { IpcBridge } from '@common/ipc/types';
import type { BootSnapshot } from '@main/ipc/boot';
import { defaultBridge } from './bridge';
import { trpc } from './index';

export type { BootSnapshot };

/**
 * Main's boot snapshot for this page load (src/main/ipc/boot.ts), or null when there is none: main
 * could not build one, or there is no bridge. With none, the page fetches what it shows.
 */
export function readBoot(bridge?: IpcBridge): BootSnapshot | null {
  try {
    return ((bridge ?? defaultBridge()).boot() as BootSnapshot | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Puts the snapshot in the cache before the first render, so the workspace queries render with
 * data rather than a loading state. They stay fresh until main says the registry or the open
 * workspace changed (query-invalidator.ts), so they are never refetched just for mounting.
 */
export function seedQueryCache(queryClient: QueryClient, boot: BootSnapshot | null): void {
  queryClient.setQueryDefaults(trpc.workspaces.pathKey(), { staleTime: Infinity });
  if (boot === null) return;
  queryClient.setQueryData(trpc.workspaces.current.queryKey(), boot.current);
  queryClient.setQueryData(trpc.workspaces.list.queryKey(), boot.workspaces);
}
