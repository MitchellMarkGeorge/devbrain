import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { workspaceIdOfPage } from '@common/types';
import { trpc } from '../../ipc';
import type { AppRouter } from '../../router';
import { openWorkspaceId } from '../../workspace/open';
import { Splash } from './Splash';
import { SPLASH_MINIMUM_MS, useHeldFor, useSwitchingWorkspace } from './use-splash';
import styles from './Splash.module.css';

/**
 * The splash, the app's one: over the whole window while a workspace opens and its first page
 * loads (docs/renderer/routing.md), held at least 600ms. Rendered beside the router, not in it, so
 * it is there from the first frame, before the router draws anything. The root hides the page
 * under it meanwhile (useSwitchingWorkspace), so the old workspace's page never draws again.
 */
export function WorkspaceSplash({ router }: { router: AppRouter }) {
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
  if (!visible) return null;
  const name = list.data?.items.find((workspace) => workspace.id === target)?.name ?? null;
  return (
    <div className={styles.layer}>
      <Splash name={name} />
    </div>
  );
}
