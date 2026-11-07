import { TRPCClientError } from '@trpc/client';
import type { SerializedError } from '@common/ipc/types';

/**
 * The error a call failed with, as main serialized it (docs/ipc/design.md, "The envelope and
 * errors"): switch on its `code`. Null for anything that didn't come from a call.
 */
export function ipcErrorOf(error: unknown): SerializedError | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data = (error as TRPCClientError<never>).data as SerializedError | undefined;
  return data && typeof data.code === 'string' ? data : null;
}
