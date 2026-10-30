import { t } from './trpc';
import { appRouter as app } from './routers/app';
import { archiveRouter as archive } from './routers/archive';
import { calendarsRouter as calendars } from './routers/calendars';
import { eventsRouter as events } from './routers/events';
import { favoritesRouter as favorites } from './routers/favorites';
import { integrationsRouter as integrations } from './routers/integrations';
import { notesRouter as notes } from './routers/notes';
import { projectsRouter as projects } from './routers/projects';
import { recentsRouter as recents } from './routers/recents';
import { searchRouter as search } from './routers/search';
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
  notes,
  projects,
  events,
  favorites,
  recents,
  search,
});

export type AppRouter = typeof appRouter;
