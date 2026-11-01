import { useMutation } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { SerializedError } from '@common/ipc/types';
import { trpc } from '../ipc';
import { openFolderErrorMessage } from './open-folder';

/**
 * "Open folder…", for the workspace switcher and the Welcome screen: main shows the folder dialog
 * and adds the workspace folder picked (a copy of it, see docs/workspaces/moving-between-computers.md),
 * then this opens it. Cancelling the dialog does nothing. `error` is a message fit to show.
 */
export function useOpenFolder() {
  const importFolder = useMutation(trpc.workspaces.importFolder.mutationOptions());
  const open = useMutation(trpc.workspaces.open.mutationOptions());

  async function openFolder(): Promise<void> {
    open.reset();
    const added = await importFolder.mutateAsync().catch(() => null);
    if (added) await open.mutateAsync({ id: added.id }).catch(() => undefined);
  }

  const failed = importFolder.error ?? open.error;
  return {
    openFolder,
    isPending: importFolder.isPending || open.isPending,
    error: failed ? openFolderErrorMessage(serializedError(failed)) : null,
  };
}

// the error as main serialized it: tRPC keeps it as the client error's `data`
function serializedError(error: unknown): SerializedError | undefined {
  if (!(error instanceof TRPCClientError)) return undefined;
  return (error.data as SerializedError | null | undefined) ?? undefined;
}
