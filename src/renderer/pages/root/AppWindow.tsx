import { RouterProvider } from '@tanstack/react-router';
import type { AppRouter } from '../../router';
import { DevBrainUnavailable } from './Root';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { trpc } from '../../ipc';
import { applyThemeSetting } from '../../theme';

/**
 * What the window draws, inside its providers (main.tsx, and the routing tests' harness): the
 * router, or, when DevBrain couldn't open its data folder (InitialLoadContext.devBrainAvailable),
 * the screen saying so. That is known before anything renders and holds until DevBrain is
 * reopened, so the router isn't mounted at all: no route's beforeLoad or loader runs.
 */
export function AppWindow({
  router,
  devBrainAvailable,
}: {
  router: AppRouter;
  devBrainAvailable: boolean;
}) {
  // apply the theme globally
  const settings = useQuery(trpc.settings.get.queryOptions());
  const theme = settings.data?.theme;

  useEffect(() => {
    if (theme) applyThemeSetting(theme);
  }, [theme]);

  return devBrainAvailable ? <RouterProvider router={router} /> : <DevBrainUnavailable />;
}
