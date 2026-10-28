import type { StandardSchemaV1Error, TRPCError } from '@trpc/server';
import type { IpcErrorCode, SerializedError } from '@common/ipc/types';
import { CoreError } from '@main/core/shared/errors';

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong';

// A failure of the IPC layer's own, with one of our codes: `no_workspace_open`, `cancelled`, or a
// request main refuses. serializeError keeps it as it is
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly data: Record<string, unknown>;

  constructor(code: IpcErrorCode, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
    this.data = data;
  }
}

// fields every error has, which the envelope already carries or must not
const OMITTED_FIELDS = new Set(['name', 'message', 'code', 'stack', 'cause']);

// What the renderer sees of a failure. A CoreError or an IpcError was thrown on purpose: it keeps
// its code and message, and its own fields (a RateLimitError's `retryAt`, …) go into `data`.
// Anything else is a bug or a library's error, whose message may name files or SQL: it becomes
// `internal` with a generic message, and main logs the original (attachRouter's onError).
export function serializeError(error: unknown): SerializedError {
  if (error instanceof IpcError) {
    return { code: error.code, message: error.message, data: error.data };
  }
  if (error instanceof CoreError) {
    return { code: error.code, message: error.message, data: ownFields(error) };
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

/**
 * What the renderer sees of a failure tRPC caught: core's invalid_input, with the issues, for an
 * input that failed to parse, and what the resolver or a middleware threw (the TRPCError's cause)
 * for anything else. The router's errorFormatter puts this in the error shape's `data`.
 */
export function serializeTRPCError(error: TRPCError): SerializedError {
  // A failed input parse is BAD_REQUEST, its cause the validator's error (a ZodError, or tRPC's
  // StandardSchemaV1Error), both with `issues`. Anything else: what the resolver threw is the
  // cause, which tRPC wrapped
  const issues = (error.cause as { issues?: StandardSchemaV1Error['issues'] } | undefined)?.issues;
  return error.code === 'BAD_REQUEST' && Array.isArray(issues)
    ? invalidInput(issues)
    : serializeError(error.cause ?? error);
}

// core's invalid_input, with the issues in `data`
function invalidInput(issues: StandardSchemaV1Error['issues']): SerializedError {
  return {
    code: 'invalid_input',
    message: issues.length === 1 ? `Invalid input: ${issues[0].message}` : 'Invalid input',
    data: {
      issues: issues.map((issue) => ({
        message: issue.message,
        // path segments may be symbols or { key } objects, which don't cross IPC
        path: (issue.path ?? []).map((segment) => {
          const key = typeof segment === 'object' ? segment.key : segment;
          return typeof key === 'number' ? key : String(key);
        }),
      })),
    },
  };
}
