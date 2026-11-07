import { useState, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workspaceIdOfPage } from '@common/types';
import { trpc } from '../../ipc';
import type { AppRouter } from '../../router';
import { openWorkspaceId } from '../../workspace/open';
import { Splash } from './Splash';
import { SPLASH_MINIMUM_MS, SplashVisible, useHeldFor, useSwitchingWorkspace } from './use-splash';

/**
 * The app's one splash (docs/renderer/routing.md). Wraps the router in main.tsx: it is up while
 * the router is on its way to another workspace (useSwitchingWorkspace), and for at least 600ms.
 * It is outside the router, so it is there from the first frame, before the router draws
 * anything. While it is up the root draws no page (useSplashVisible), so the splash is all the
 * window holds: the old workspace's page is gone from the start of a switch, and the new one
 * mounts as the splash goes, in the same render.
 */
export function SplashProvider({ router, children }: { router: AppRouter; children: ReactNode }) {
  // the workspace open as the page loaded: opening it again is no switch (a reload)
  const [openAtStart] = useState(() => openWorkspaceId() ?? null);
  const switching = useSwitchingWorkspace(router, openAtStart);
  const visible = useHeldFor(
    switching,
    router.options.context.splashMinimumMs ?? SPLASH_MINIMUM_MS,
  );
  const target = useRouterState({
    router,
    select: (state) => workspaceIdOfPage(state.location.pathname),
  });
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const name = list.data?.items.find((workspace) => workspace.id === target)?.name ?? null;
  return (
    <SplashVisible.Provider value={visible}>
      {visible && <Splash name={name} />}
      {children}
    </SplashVisible.Provider>
  );
}
