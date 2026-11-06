import { lastPageSchema } from '@common/types';
import type { DevBrain } from '@main/core';

// "Reopen last page" (general.openToLastPage): main remembers the page the window shows, and saves
// it as state.lastPage when the workspace closes (on quit, and on a switch, before the next one
// opens). The renderer keeps its location in the URL's hash (hash history), so the window's URL
// says where it is, and the renderer only reads the page back on launch, from the initial load
// context. Nothing is sent over IPC as the user navigates.

/**
 * The page in a window URL, as state.lastPage keeps it: the hash's /app path with its search
 * params (`…/index.html#/app/tasks?view=board` → `/app/tasks?view=board`), or null for a URL that
 * shows no page in the app (onboarding, the splash, a malformed URL).
 */
export function lastPageOf(url: string): string | null {
  let hash: string;
  try {
    hash = new URL(url).hash;
  } catch {
    return null;
  }
  const page = hash.startsWith('#') ? hash.slice(1) : hash;
  return lastPageSchema.safeParse(page).success ? page : null;
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

/**
 * Keeps the last page in the app any window navigated to, and saves it as state.lastPage each time
 * a workspace closes, then forgets it, so the next workspace's first page isn't taken for the old
 * one's. The page is kept as the window navigates rather than read at the close: on Windows and
 * Linux the window has gone by the time the workspace closes. Attach before the first window.
 */
export function saveLastPageOnClose(app: WindowCreatingApp, devBrain: DevBrain): void {
  let page: string | null = null;
  const onNavigate = (_event: unknown, url: string) => {
    page = lastPageOf(url) ?? page;
  };
  app.on('browser-window-created', (_event, window) => {
    // a load (and a reload); then the router's pushState and replaceState, which change the hash
    window.webContents.on('did-navigate', onNavigate);
    window.webContents.on('did-navigate-in-page', onNavigate);
  });
  devBrain.workspaces.onChange((change) => {
    if (change.type !== 'closed') return;
    if (page !== null) devBrain.settings.set('state.lastPage', page);
    page = null;
  });
}
