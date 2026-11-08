import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { workspaceIdOfPage } from '@common/types';
import type { events as appEvents, ipc as appIpc, trpc as appTrpc } from './ipc';
import { routeTree } from './routeTree.gen';
import { NotFoundPage } from './pages/app/NotFoundPage';
import { PagePending } from './pages/app/PagePending';
import { RouteErrorPage } from './pages/app/RouteErrorPage';

// The app's one router (docs/renderer/routing.md). main.tsx makes it once, with hash history, and
// never makes another: not at startup, a switch of workspace or onboarding. Tests make one per
// test over memory history.

/** What every route's beforeLoad and loader get. */
export interface RouterContext {
  queryClient: QueryClient;
  trpc: typeof appTrpc;
  ipc: typeof appIpc;
  /** how long an open shows the splash at least, 600ms by default (tests set 0) */
  splashMinimumMs?: number;
  /** false when DevBrain couldn't open its data folder (InitialLoadContext.devBrainAvailable) */
  devBrainAvailable: boolean;
}

/** The selector `AppShell` gives the element pages scroll in, scrolled to the top on navigation. */
export const PAGE_SCROLL_SELECTOR = '[data-slot="page-scroll"]';

/** How long an open shows the splash at least, so a quick switch doesn't flicker. */
export const SPLASH_MINIMUM_MS = 600;

export function createAppRouter({
  history,
  context,
}: {
  history: RouterHistory;
  context: RouterContext;
}) {
  const router = createRouter({
    routeTree,
    history,
    context,
    // hovering a link runs its page's loaders, which prime React Query's cache; the
    // /app/$workspaceId route skips a preload into a workspace that isn't open
    defaultPreload: 'intent',
    // React Query decides freshness; the router caches nothing of its own
    defaultPreloadStaleTime: 0,
    // a page whose loaders take longer than this shows PagePending in its place (React hides the
    // old page under it); IPC is quick, so most pages never show it
    defaultPendingMs: 150,
    defaultPendingComponent: PagePending,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: RouteErrorPage,
    // pages scroll inside AppShell, not the window: the router restores what scrolled, and
    // scrolls the page's scroller to the top on a new page
    scrollRestoration: true,
    scrollToTopSelectors: [PAGE_SCROLL_SELECTOR],
  });

  return router;
}

export type AppRouter = ReturnType<typeof createAppRouter>;

/**
 * Follows changes to what is open that come from no navigation of this window's: the open
 * workspace deleted or closed (to onboarding), or another one opened (to its page). The steps of
 * an open (`opening` set), and anything while the router loads (this window's own open, whose
 * route shows how it ended), are left alone. Returns the function that stops.
 */
export function followOutsideChanges(router: AppRouter, events: typeof appEvents): () => void {
  return events.on('workspace.changed', ({ id, opening }) => {
    if (opening !== null || router.state.isLoading) return;
    const shown = workspaceIdOfPage(router.latestLocation.pathname);
    if (id === null) {
      if (shown !== null) void router.navigate({ to: '/onboarding', replace: true });
    } else if (shown !== id) {
      void router.navigate({ to: '/app/$workspaceId', params: { workspaceId: id } });
    }
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
  interface StaticDataRouteOption {
    /** the page's name in its header (a later milestone adds the entity's title) */
    title?: string;
  }
}
