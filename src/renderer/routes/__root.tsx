import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '@renderer/app/router';
import { RootError, RootLayout } from '@renderer/app/Root';
import { NotFoundScreen } from '@renderer/app/NotFoundScreen';

// The root: toasts, dialogs, no page while a workspace loads (the splash is around the router,
// app/Splash.tsx), and the screen for when
// DevBrain couldn't open its data folder (docs/renderer/routing.md).
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: NotFoundScreen,
});
