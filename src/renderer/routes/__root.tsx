import { lazy, Suspense } from 'react';
import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router';
import { ToastProvider } from '../components';
import type { RouterContext } from '../app/context';
import { DevBrainUnavailable } from '../app/Splash';
import { useWorkspaceRouting } from '../app/workspace-routing';
import {
  WorkspaceActionsProvider,
  WorkspaceErrorDialog,
} from '../pages/onboarding/WorkspaceErrorDialog';

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
 * Around every page: the toasts, the workspace actions with their error dialog (which outlive the
 * page that started an open), and the navigation to `/` whenever the open workspace changes. When
 * DevBrain itself couldn't load, nothing else.
 */
function Root() {
  const { initialLoadContext } = Route.useRouteContext();
  if (initialLoadContext?.devBrainAvailable === false) return <DevBrainUnavailable />;
  return (
    <ToastProvider>
      <WorkspaceActionsProvider initialFailure={initialLoadContext?.openFailure}>
        <WithDevBrain />
      </WorkspaceActionsProvider>
    </ToastProvider>
  );
}

function WithDevBrain() {
  useWorkspaceRouting();
  // a failure waits for the splash to give way, so it shows over the page that follows
  const atSplash = useRouterState({ select: (state) => state.location.pathname === '/' });
  return (
    <>
      <Outlet />
      <WorkspaceErrorDialog held={atSplash} />
      <Suspense>
        <RouterDevtools position="bottom-right" />
      </Suspense>
    </>
  );
}
