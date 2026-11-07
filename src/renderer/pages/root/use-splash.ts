import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workspaceIdOfPage } from '@common/types';
import { trpc } from '../../ipc';
import { isSettledOn } from '../../workspace/open';

/** How long the splash shows at least, so a quick switch doesn't flicker. */
export const SPLASH_MINIMUM_MS = 600;

// When each router's splash went up. Shared by RootPending and RootLayout: on the first load the
// router draws one and then the other, and the splash's minimum carries across.
const shownSince = new WeakMap<object, number>();

/**
 * Whether the splash covers the window, and the workspace it names. It goes up when a navigation
 * heads for a workspace that isn't open (a switch, or the open at startup), stays while that
 * navigation's loaders run, and comes down once it has resolved and the splash has shown for the
 * router's `splashMinimumMs`. The root draws it in place of the page, so the old workspace's page
 * is unmounted from the start of a switch and never refetches with the new one's data.
 */
export function useSplash(): { visible: boolean; name: string | null } {
  const router = useRouter();
  const minimumMs = router.options.context.splashMinimumMs ?? SPLASH_MINIMUM_MS;
  const loading = useRouterState({ select: (state) => state.status === 'pending' });
  // the workspace the navigation heads for, and the one on screen (none before the first load)
  const target = useRouterState({ select: (state) => workspaceIdOfPage(state.location.pathname) });
  const shown = useRouterState({
    select: (state) =>
      state.resolvedLocation ? workspaceIdOfPage(state.resolvedLocation.pathname) : null,
  });
  const list = useQuery(trpc.workspaces.list.queryOptions());

  // a switch: the navigation names another workspace than the one on screen, and it isn't open
  // (an outside open, or Back to the workspace a failed open left open, needs no splash)
  const switching = loading && target !== null && target !== shown && !isSettledOn(target);
  // up from the start of a switch until its navigation has resolved
  const [up, setUp] = useState(() => shownSince.has(router));
  if (switching && !up) setUp(true);
  // resolved: held until the minimum has passed, unless another switch starts meanwhile
  const [holding, setHolding] = useState(false);
  if (up && !loading && !holding) setHolding(true);
  if (holding && loading) setHolding(false);

  useLayoutEffect(() => {
    if (up && !shownSince.has(router)) shownSince.set(router, Date.now());
  }, [up, router]);
  useEffect(() => {
    if (!holding) return;
    const left = (shownSince.get(router) ?? 0) + minimumMs - Date.now();
    const timer = setTimeout(
      () => {
        shownSince.delete(router);
        setUp(false);
        setHolding(false);
      },
      Math.max(0, left),
    );
    return () => clearTimeout(timer);
  }, [holding, minimumMs, router]);

  const name = list.data?.items.find((workspace) => workspace.id === target)?.name ?? null;
  return { visible: up, name };
}
