import { isCoreErrorCode } from '../errors';
import type { IpcErrorCode, SerializedError } from './types';

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong';

// A failed call, as the renderer's client throws it, and as main's own code throws an IPC-level
// failure (`no_workspace_open`, `cancelled`). `data` holds the original error's own fields.
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly data: Record<string, unknown>;

  constructor(
    code: IpcErrorCode,
    message: string,
    data: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'IpcError';
    this.code = code;
    this.data = data;
  }

  static fromSerialized(error: SerializedError): IpcError {
    return new IpcError(error.code, error.message, error.data);
  }
}

// fields every error has, which the envelope already carries or must not
const OMITTED_FIELDS = new Set(['name', 'message', 'code', 'stack', 'cause']);

// An error as it crosses IPC. A core error (an Error whose `code` is a CoreErrorCode, which every
// CoreError subclass sets) or an IpcError keeps its code and message, and its own fields go into
// `data`. Anything else is a bug or an error from a library, whose message may say more than the
// renderer should see: it becomes `internal` with a generic message, and main logs the original.
export function serializeError(error: unknown): SerializedError {
  if (error instanceof IpcError) {
    return { code: error.code, message: error.message, data: error.data };
  }
  if (error instanceof Error && isCoreErrorCode((error as { code?: unknown }).code)) {
    const code = (error as Error & { code: IpcErrorCode }).code;
    return { code, message: error.message, data: ownFields(error) };
  }
  return { code: 'internal', message: INTERNAL_ERROR_MESSAGE, data: {} };
}

function ownFields(error: Error): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(error)) {
    if (OMITTED_FIELDS.has(key) || typeof value === 'function') continue;
    data[key] = value;
  }
  return data;
}
