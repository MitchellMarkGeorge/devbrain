import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../router';
import { DevBrainUnavailableError, RootError, RootLayout } from '../pages/root/Root';
import { NotFoundScreen } from '../pages/root/NotFoundScreen';

// The root: toasts, the page (none while the splash is up: SplashProvider, around the router), and
// the screen for when DevBrain couldn't open its data folder (docs/renderer/routing.md).
export const Route = createRootRouteWithContext<RouterContext>()({
  // Runs on every navigation, Back and Forward included.
  beforeLoad: ({ context }) => {
    if (!context.devBrainAvailable) throw new DevBrainUnavailableError();
  },
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: NotFoundScreen,
});
