import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';

/**
 * Whether the window is on its way from one workspace to another: the URL (which moves as a
 * navigation starts) names another workspace than the page last shown (`resolvedLocation`, which
 * moves once it has loaded). The root drops its dialogs meanwhile, as they belong to the workspace
 * closing. The splash is `/app/$workspaceId`'s pending component, not this.
 */
export function useSwitchingWorkspace(): boolean {
  return useRouterState({
    select: (state) => {
      if (!state.resolvedLocation) return false;
      const target = workspaceIdOfPage(state.location.pathname);
      return target !== null && target !== workspaceIdOfPage(state.resolvedLocation.pathname);
    },
  });
}
