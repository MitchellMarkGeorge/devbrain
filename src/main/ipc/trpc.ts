import { initTRPC } from '@trpc/server';
import type { StandardSchemaV1Error } from '@trpc/server';
import { serializeError } from '@common/ipc/errors';
import { InvalidInputError } from '@main/core/shared/errors';
import type { AppContext } from './context';

// a validation failure: core's invalid_input, with the schema's issues in `data`
export class InputValidationError extends InvalidInputError {
  readonly issues: { message: string; path: (string | number)[] }[];

  constructor(issues: StandardSchemaV1Error['issues']) {
    super(issues.length === 1 ? `Invalid input: ${issues[0].message}` : 'Invalid input');
    this.name = 'InputValidationError';
    // path segments may be symbols or { key } objects, which don't cross IPC
    this.issues = issues.map((issue) => ({
      message: issue.message,
      path: (issue.path ?? []).map((segment) => {
        const key = typeof segment === 'object' ? segment.key : segment;
        return typeof key === 'number' ? key : String(key);
      }),
    }));
  }
}

// The tRPC instance every router in src/main/ipc/routers is built with. Its errorFormatter puts our
// own serialized error in the shape's `data`, which the renderer's TRPCClientError carries, typed.
export const t = initTRPC.context<AppContext>().create({
  errorFormatter({ shape, error }) {
    // tRPC wraps whatever a resolver threw; what was thrown is the cause. A failed input parse is
    // BAD_REQUEST, its cause the validator's error (a ZodError, or tRPC's StandardSchemaV1Error),
    // both with `issues`
    const issues = (error.cause as { issues?: unknown } | undefined)?.issues;
    const thrown =
      error.code === 'BAD_REQUEST' && Array.isArray(issues)
        ? new InputValidationError(issues)
        : (error.cause ?? error);
    const data = serializeError(thrown);
    return { code: shape.code, message: data.message, data };
  },
});
