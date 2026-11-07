import { TRPCClientError } from '@trpc/client';
import type { IpcErrorCode, SerializedError } from '@common/ipc/types';

/**
 * What main said went wrong with a call (docs/ipc/design.md, "The envelope and errors"): its
 * code, core's message, and the error's own fields under `data` (a `workspace_import`'s `reason`).
 * Null for anything that isn't a failed call's error.
 */
export type IpcFailure = SerializedError;

export function ipcFailureOf(error: unknown): IpcFailure | null {
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

/** The code main failed a call with, or undefined when `error` isn't a failed call. */
export function ipcErrorCode(error: unknown): IpcErrorCode | undefined {
  return ipcFailureOf(error)?.code;
}
