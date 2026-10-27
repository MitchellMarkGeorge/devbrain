import { createRouter } from '@common/ipc/procedure';
import { appRouter as app } from './routers/app';

// Everything the renderer can call, attached in src/main/index.ts. The renderer imports AppRouter
// as a type only (src/renderer/ipc) and calls it through Client<AppRouter>.
export const appRouter = createRouter({
  app,
});

export type AppRouter = typeof appRouter;
