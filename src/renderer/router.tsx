import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { RouterContext } from './app/context';
import { NotFoundPage, RouteErrorPage } from './app/pages';
import { routeTree } from './routeTree.gen';

/**
 * A router over the file routes in ./routes (routeTree.gen.ts is generated from them by the Vite
 * plugin). The app makes one while a workspace is open, over the window's hash history
 * (app/WorkspaceApp.tsx), and one for onboarding over memory history (app/OnboardingApp.tsx).
 * Tests pass memory history for both.
 */
export function createAppRouter(context: RouterContext, history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context,
    // hovering a link runs its page's loader, which primes the cache
    defaultPreload: 'intent',
    // React Query decides what is fresh; the router keeps no cache of its own
    defaultPreloadStaleTime: 0,
    // pending UI only when IPC is slow (a provider fetch)
    defaultPendingMs: 150,
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: RouteErrorPage,
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
