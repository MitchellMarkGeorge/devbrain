import { createRootRouteWithContext } from '@tanstack/react-router';
import type { RouterContext } from '../router';
import { RootShell } from '../pages/root/RootShell';
import { NotFoundPage, RouteErrorPage } from '../pages/root/RouteFallbacks';

export const Route = createRootRouteWithContext<RouterContext>()({
  // Every navigation, Back and Forward included: a location that doesn't belong to what is open
  // (a page of the workspace open before, the app with none open) goes to its first page. Not a
  // preload (pointing at a link): it has no history entry yet, and the navigation, if it comes,
  // is guarded then
  beforeLoad: ({ context, location, preload }) => {
    if (!preload) context.session.guard(location);
  },
  // the toasts, the splash and the DevBrain-unavailable screen, around the whole tree
  shellComponent: RootShell,
  // On its first load the router renders nothing, the shell included, until the loaders are done,
  // unless the root has pending UI to show meanwhile: this empty one lets the shell draw the
  // splash during a reload onto a slow page
  pendingComponent: () => null,
  pendingMs: 0,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});
