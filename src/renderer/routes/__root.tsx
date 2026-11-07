import { lazy, Suspense } from 'react';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '../app/context';

// the router's devtools, in development builds only (and never under test)
const RouterDevtools =
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? lazy(() =>
        import('@tanstack/react-router-devtools').then((module) => ({
          default: module.TanStackRouterDevtools,
        })),
      )
    : () => null;

// Around every page, in both routers (the app's and onboarding's): nothing about which workspace is
// open. A router only exists while the window shows its part (app/WindowContent.tsx), so no route
// follows a workspace opening, closing or failing. Not-found and error pages are the router's
// defaults (router.tsx).
export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

function Root() {
  return (
    <>
      <Outlet />
      <Suspense>
        <RouterDevtools position="bottom-right" />
      </Suspense>
    </>
  );
}
