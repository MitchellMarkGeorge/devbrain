import type { WorkspaceId } from '@common/ids';
import { lastPageSchema, workspaceIdOfPage } from '@common/types';
import type { DevBrain } from '@main/core';
import { lastOpenedWorkspace } from './start';

// The window's URL says which workspace it shows and where (docs/renderer/routing.md): the
// renderer keeps its location in the URL's hash (hash history), and every page in a workspace is
// under /app/<its id>. Main reads it in two places:
//
// - "Reopen last page" (general.openToLastPage): main remembers the last page the window showed in
//   each workspace, and saves a workspace's in its manifest when it closes (on quit, and on a
//   switch), so each workspace reopens on its own page, wherever its folder goes. Nothing is sent
//   over IPC as the user navigates.
// - The window's first URL: main picks the workspace to open, and the page (initialRoute).

/**
 * The page in a window URL, as a workspace's manifest keeps it: the hash's /app/<id> path with its
 * search params (`…/index.html#/app/wsp_1/tasks?view=board` → `/app/wsp_1/tasks?view=board`), or
 * null for a URL that shows no workspace's page (onboarding, a malformed URL).
 */
export function lastPageOf(url: string): string | null {
  let hash: string;
  try {
    hash = new URL(url).hash;
  } catch {
    return null;
  }
  const page = hash.startsWith('#') ? hash.slice(1) : hash;
  return lastPageSchema.safeParse(page).success && workspaceIdOfPage(page) !== null ? page : null;
}

/** The parts of Electron's app and a window's webContents followed here. */
export interface WindowCreatingApp {
  on(
    event: 'browser-window-created',
    listener: (event: unknown, window: { webContents: NavigatingContents }) => void,
  ): unknown;
}

export interface NavigatingContents {
  on(
    event: 'did-navigate' | 'did-navigate-in-page',
    listener: (event: unknown, url: string) => void,
  ): unknown;
}

/** The last page the window showed in each workspace, since main started. */
export interface LastPages {
  of(id: WorkspaceId): string | null;
}

/**
 * Keeps the last page the window showed in each workspace, and saves a workspace's in its
 * manifest when it closes. Kept per workspace because the window's URL moves to the next
 * workspace's page as a switch starts, before the old one closes: a single "current page" would
 * be the new workspace's by then. The page is kept as the window navigates rather than read at
 * the close: on Windows and Linux the window has gone by the time the workspace closes. Attach
 * before the first window.
 */
export function saveLastPageOnClose(app: WindowCreatingApp, devBrain: DevBrain): LastPages {
  const pages = new Map<WorkspaceId, string>();
  const onNavigate = (_event: unknown, url: string) => {
    const page = lastPageOf(url);
    const id = page === null ? null : workspaceIdOfPage(page);
    if (page !== null && id !== null) pages.set(id, page);
  };
  app.on('browser-window-created', (_event, window) => {
    // a load (and a reload); then the router's pushState and replaceState, which change the hash
    window.webContents.on('did-navigate', onNavigate);
    window.webContents.on('did-navigate-in-page', onNavigate);
  });
  devBrain.workspaces.onChange((change) => {
    if (change.type !== 'closed') return;
    const page = pages.get(change.workspaceId);
    if (page === undefined) return;
    try {
      devBrain.workspaces.setLastPage(change.workspaceId, page);
    } catch {
      // deleted with its folder (a delete closes it first): there is nothing to save it in
    }
  });
  return { of: (id) => pages.get(id) ?? null };
}

/** Onboarding: where the window starts when there is no workspace to open. */
export const ONBOARDING_ROUTE = '/onboarding';

/**
 * The route the window opens on (its URL's hash): the open workspace's when one is open (a window
 * made again on macOS), else the workspace open last time, at `/app/<id>`, or on its last page
 * when "Reopen last page" is on and it has one. `/onboarding` when there is none, it has been
 * deleted since, or DevBrain did not load (the renderer then shows why). The renderer opens the
 * workspace its route names; main opens nothing here.
 */
export function initialRoute(devBrain: DevBrain | null, lastPages?: LastPages): string {
  if (devBrain === null) return ONBOARDING_ROUTE;
  const current = devBrain.currentWorkspace?.info ?? null;
  const id = current?.id ?? lastOpenedWorkspace(devBrain);
  if (id === null) return ONBOARDING_ROUTE;
  const workspaceRoute = `/app/${id}`;
  if (!devBrain.settings.get('settings.general.openToLastPage')) return workspaceRoute;
  let page = lastPages?.of(id) ?? null;
  if (page === null) {
    try {
      page = current?.lastPage ?? devBrain.workspaces.getById(id).lastPage;
    } catch {
      page = null;
    }
  }
  return page !== null && workspaceIdOfPage(page) === id ? page : workspaceRoute;
}
