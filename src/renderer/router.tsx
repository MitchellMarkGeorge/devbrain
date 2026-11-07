import { createRouter, type RouterHistory } from '@tanstack/react-router';
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
    // React Query decides freshness; the router keeps no cache of its own
    defaultPreloadStaleTime: 0,
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
