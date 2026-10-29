import { initTRPC } from '@trpc/server';
import type { StandardSchemaV1Error } from '@trpc/server';
import type { SerializedError } from '@common/ipc/types';
import type { AppContext } from './context';
import { serializeError } from './errors';

// The tRPC instance every router in src/main/ipc/routers is built with. Its errorFormatter puts our
// own serialized error in the shape's `data`, which the renderer's TRPCClientError carries, typed.
// Routes start from the base procedures in procedures.ts, never t.procedure.
export const t = initTRPC.context<AppContext>().create({
  errorFormatter({ shape, error }) {
    // A failed input parse is BAD_REQUEST, its cause the validator's error (a ZodError, or tRPC's
    // StandardSchemaV1Error), both with `issues`. Anything else: what the resolver threw is the
    // cause, which tRPC wrapped
    const issues = (error.cause as { issues?: StandardSchemaV1Error['issues'] } | undefined)
      ?.issues;
    const data =
      error.code === 'BAD_REQUEST' && Array.isArray(issues)
        ? invalidInput(issues)
        : serializeError(error.cause ?? error);
    return { code: shape.code, message: data.message, data };
  },
});

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
