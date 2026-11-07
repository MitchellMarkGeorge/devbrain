import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../router';
import { DevBrainUnavailableError, RootError, RootLayout, RootPending } from '../pages/root/Root';
import { NotFoundScreen } from '../pages/root/NotFoundScreen';

// The root: toasts, the splash over the window while a workspace opens, and the screen for when
// DevBrain couldn't open its data folder (docs/renderer/routing.md).
export const Route = createRootRouteWithContext<RouterContext>()({
  // Runs on every navigation, Back and Forward included. Also makes the root pending on the first
  // load, which is what lets its pendingComponent draw while the first page loads: without a
  // beforeLoad the router draws nothing at all until then.
  beforeLoad: ({ context }) => {
    if (!context.devBrainAvailable) throw new DevBrainUnavailableError();
  },
  component: RootLayout,
  // the first load only: the splash while the workspace opens, else the empty window
  pendingComponent: RootPending,
  pendingMs: 0,
  pendingMinMs: 0,
  errorComponent: RootError,
  notFoundComponent: NotFoundScreen,
});
