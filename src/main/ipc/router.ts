import { t } from './trpc';
import { appRouter as app } from './routers/app';
import { archiveRouter as archive } from './routers/archive';
import { settingsRouter as settings } from './routers/settings';
import { tasksRouter as tasks } from './routers/tasks';
import { workspaceRouter as workspace } from './routers/workspace';
import { workspacesRouter as workspaces } from './routers/workspaces';

// Everything the renderer can call, attached in src/main/index.ts. The renderer imports AppRouter
// as a type only (src/renderer/ipc) and calls it through tRPC's client.
export const appRouter = t.router({
  app,
  workspaces,
  workspace,
  settings,
  tasks,
  archive,
});

export type AppRouter = typeof appRouter;
