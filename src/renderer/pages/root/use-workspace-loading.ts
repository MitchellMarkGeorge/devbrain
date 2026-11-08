import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';
import type { AppRouter } from '../../router';
import { workspaceShownAt } from '../../workspace/shown';

/**
 * Whether the window is loading a workspace: the router's first load isn't done, or it is on its
 * way to another workspace than the one it shows (the URL moves as a navigation starts;
 * `resolvedLocation` once it has loaded, the open's 600ms included). Going back from Create
 * workspace to the workspace open behind it is no switch (`workspaceShownAt`). The splash shows
 * while it is true (`WithSplash`), and the root draws no page and no dialogs (`RootLayout`). Pass
 * `router` outside `RouterProvider`.
 */
export function useWorkspaceLoading(router?: AppRouter): boolean {
  return useRouterState({
    router,
    select: (state) => {
      if (!state.resolvedLocation) return true;
      const target = workspaceIdOfPage(state.location.pathname);
      return target !== null && target !== workspaceShownAt(state.resolvedLocation);
    },
  });
}
