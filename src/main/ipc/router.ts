import { t } from './trpc';
import { appRouter as app } from './routers/app';
import { settingsRouter as settings } from './routers/settings';
import { workspaceRouter as workspace } from './routers/workspace';
import { workspacesRouter as workspaces } from './routers/workspaces';

// Everything the renderer can call, attached in src/main/index.ts. The renderer imports AppRouter
// as a type only (src/renderer/ipc) and calls it through tRPC's client.
export const appRouter = t.router({
  app,
  workspaces,
  workspace,
  settings,
});

export type AppRouter = typeof appRouter;
