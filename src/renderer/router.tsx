import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { APP_SHELL_SCROLL_ID } from './components';
import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@main/ipc/router';
import type { WorkspaceSession } from './session/workspace-session';
import { routeTree } from './routeTree.gen';

// The app's one router (docs/renderer/router-splash-exploration.md). main.tsx makes it once, with
// hash history, so main reads the page from the window's URL; tests make theirs with memory history.

export interface RouterContext {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  ipc: TRPCClient<AppRouter>;
  // which workspace is open, and the navigations its lifecycle calls for
  session: WorkspaceSession;
  // false when main couldn't load DevBrain: the root shows why, and no route
  devBrainAvailable: boolean;
  // how long the splash shows at least, so a quick switch doesn't flicker
  splashMinimumMs: number;
}

export const SPLASH_MINIMUM_MS = 600;

export function createAppRouter(history: RouterHistory, context: RouterContext) {
  return createRouter({
    routeTree,
    history,
    context,
    // pointing at a link loads its page (its loader primes React Query's cache), so the page
    // usually draws with its data on the click
    defaultPreload: 'intent',
    // React Query decides freshness; the router keeps no cache of its own
    defaultPreloadStaleTime: 0,
    // No default pending UI: between two pages that both have one, the router keeps the old page
    // until the new one is ready (library-behaviour.test.ts), so AppLayout shows its own
    // Back and Forward return each page to where it was scrolled, and a new page starts at the
    // top. The page scrolls in AppShell, not the window, so that element is named here
    scrollRestoration: true,
    scrollToTopSelectors: [`[data-scroll-restoration-id="${APP_SHELL_SCROLL_ID}"]`],
  });
}

export type AppRouterInstance = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouterInstance;
  }
  interface StaticDataRouteOption {
    // the page's name in the header's breadcrumb; a page without one draws an empty header
    title?: string;
  }
}
