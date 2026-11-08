import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../router';
import { RootError, RootLayout } from '../pages/root/Root';
import { NotFoundScreen } from '../pages/root/NotFoundScreen';

// The root: toasts, dialogs, no page while a workspace loads (the splash is around the router,
// pages/root/Splash.tsx), and the screen for when
// DevBrain couldn't open its data folder (docs/renderer/routing.md).
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: NotFoundScreen,
});
