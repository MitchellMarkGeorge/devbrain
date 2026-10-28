import { initTRPC } from '@trpc/server';
import type { AppContext } from './context';
import { serializeTRPCError } from './errors';

// The tRPC instance every router in src/main/ipc/routers is built with. Its errorFormatter puts our
// own serialized error in the shape's `data`, which the renderer's TRPCClientError carries, typed.
// Routes start from the base procedures in procedures.ts, never t.procedure.
export const t = initTRPC.context<AppContext>().create({
  errorFormatter({ shape, error }) {
    const data = serializeTRPCError(error);
    return { code: shape.code, message: data.message, data };
  },
});
