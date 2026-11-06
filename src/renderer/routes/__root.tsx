import { lazy, Suspense } from 'react';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { ToastProvider } from '../components';
import type { RouterContext } from '../app/context';
import { DevBrainUnavailable } from '../app/Splash';
import { useWorkspaceRouting, WorkspaceSwitchSplash } from '../app/workspace-routing';

// the router's devtools, in development builds only (and never under test)
const RouterDevtools =
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? lazy(() =>
        import('@tanstack/react-router-devtools').then((module) => ({
          default: module.TanStackRouterDevtools,
        })),
      )
    : () => null;

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
});

/**
 * Around every page: the toasts, the splash over everything while a workspace opens, and the
 * navigation that follows the open workspace. When DevBrain itself couldn't load, nothing else.
 */
function Root() {
  const { initialLoadContext } = Route.useRouteContext();
  if (initialLoadContext?.devBrainAvailable === false) return <DevBrainUnavailable />;
  return (
    <ToastProvider>
      <WithDevBrain />
    </ToastProvider>
  );
}

function WithDevBrain() {
  useWorkspaceRouting();
  return (
    <>
      <Outlet />
      <WorkspaceSwitchSplash />
      <Suspense>
        <RouterDevtools position="bottom-right" />
      </Suspense>
    </>
  );
}
