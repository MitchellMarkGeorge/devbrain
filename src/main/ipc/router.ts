import { t } from './trpc';
import { appRouter as app } from './routers/app';
import { archiveRouter as archive } from './routers/archive';
import { calendarsRouter as calendars } from './routers/calendars';
import { integrationsRouter as integrations } from './routers/integrations';
import { settingsRouter as settings } from './routers/settings';
import { sourcesRouter as sources } from './routers/sources';
import { syncRouter as sync } from './routers/sync';
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
  calendars,
  integrations,
  sources,
  sync,
});

export type AppRouter = typeof appRouter;
