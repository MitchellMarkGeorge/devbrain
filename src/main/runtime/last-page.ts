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

/** The parts of a window's webContents followed here. */
export interface NavigatingContents {
  on(
    event: 'did-navigate' | 'did-navigate-in-page',
    listener: (event: unknown, url: string) => void,
  ): unknown;
}

/**
 * The page the window was on last: every navigation to a page in the app, kept in memory. Read when
 * the workspace closes, which on Windows and Linux happens after the window has gone.
 */
export class PageTracker {
  private page: string | null = null;

  follow(contents: NavigatingContents): void {
    const onNavigate = (_event: unknown, url: string) => {
      this.page = lastPageOf(url) ?? this.page;
    };
    // a load (and a reload); then the router's pushState and replaceState, which change the hash
    contents.on('did-navigate', onNavigate);
    contents.on('did-navigate-in-page', onNavigate);
  }

  get current(): string | null {
    return this.page;
  }

  /** Forgets the page, once it belongs to a workspace that has closed. */
  clear(): void {
    this.page = null;
  }
}

/**
 * Saves the tracked page as state.lastPage each time a workspace closes, then forgets it, so the
 * next workspace's first page isn't taken for the old one's. Returns the function that stops.
 */
export function saveLastPageOnClose(devBrain: DevBrain, pages: PageTracker): () => void {
  return devBrain.workspaces.onChange((change) => {
    if (change.type !== 'closed') return;
    const page = pages.current;
    if (page !== null) devBrain.settings.set('state.lastPage', page);
    pages.clear();
  });
}
