import { t } from './trpc';
import { appRouter as app } from './routers/app';
import { eventsRouter as events } from './routers/events';
import { favoritesRouter as favorites } from './routers/favorites';
import { notesRouter as notes } from './routers/notes';
import { projectsRouter as projects } from './routers/projects';
import { searchRouter as search } from './routers/search';
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
  notes,
  projects,
  events,
  favorites,
  search,
});

export type AppRouter = typeof appRouter;
