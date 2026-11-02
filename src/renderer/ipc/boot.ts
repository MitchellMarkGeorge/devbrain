import type { BootSnapshot } from '@main/ipc/boot';
import type { QueryClient } from '@tanstack/react-query';
import { defaultBridge } from './bridge';
import type { trpc as AppTrpc } from './index';

export function readBootSnapshot(): BootSnapshot | null {
  try {
    return (defaultBridge().boot() as BootSnapshot | null) ?? null;
  } catch {
    return null;
  }
}

/** Seeds exactly the two workspace queries represented by the snapshot. */
export function seedBootSnapshot(
  snapshot: BootSnapshot | null,
  queryClient: QueryClient,
  trpc: typeof AppTrpc,
): void {
  if (snapshot === null || !snapshot.devBrainAvailable || snapshot.workspaces === null) return;

  const current = trpc.workspaces.current.queryOptions();
  const workspaces = trpc.workspaces.list.queryOptions();
  queryClient.setQueryDefaults(current.queryKey, { staleTime: Infinity });
  queryClient.setQueryDefaults(workspaces.queryKey, { staleTime: Infinity });
  queryClient.setQueryData(current.queryKey, snapshot.current);
  queryClient.setQueryData(workspaces.queryKey, snapshot.workspaces);
}
