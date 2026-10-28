import { t } from './trpc';
import { appRouter as app } from './routers/app';

// Everything the renderer can call, attached in src/main/index.ts. The renderer imports AppRouter
// as a type only (src/renderer/ipc) and calls it through tRPC's client.
export const appRouter = t.router({
  app,
});

export type AppRouter = typeof appRouter;
