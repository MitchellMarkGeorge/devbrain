import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import type { AppRouter } from '../../router';

/**
 * Whether the window is loading a workspace: the router's first load isn't done, or it is on its
 * way to another workspace (the URL moves as a navigation starts; `resolvedLocation` once it has
 * loaded, the open's 600ms included). The splash shows while it is true (`WithSplash`), and the root
 * draws no page and no dialogs (`RootLayout`). Pass `router` outside `RouterProvider`.
 */
export function useWorkspaceLoading(router?: AppRouter): boolean {
  return useRouterState({
    router,
    select: (state) => {
      if (!state.resolvedLocation) return true;
      const target = workspaceIdOfPage(state.location.pathname);
      return target !== null && target !== workspaceIdOfPage(state.resolvedLocation.pathname);
    },
  });
}
