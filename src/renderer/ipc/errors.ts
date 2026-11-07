import { TRPCClientError } from '@trpc/client';
import type { IpcErrorCode, SerializedError } from '@common/ipc/types';

/**
 * The error a call failed with, as main serialized it (docs/ipc/design.md, "The envelope and
 * errors"): switch on its `code`; its own fields (a `workspace_import`'s `reason`) are in `data`.
 * Null for anything that didn't come from a call.
 */
export function ipcErrorOf(error: unknown): SerializedError | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) return null;
  const failure = data as { code: IpcErrorCode; message?: unknown; data?: unknown };
  return {
    code: failure.code,
    message: typeof failure.message === 'string' ? failure.message : error.message,
    data:
      typeof failure.data === 'object' && failure.data !== null
        ? (failure.data as Record<string, unknown>)
        : {},
  };
}
