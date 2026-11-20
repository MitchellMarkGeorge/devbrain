import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { workspaceIdOfPage } from '@common/types';

/**
 * Whether the window is on its way from one workspace to another: the URL (which moves as a
 * navigation starts) names another workspace than the one last shown (`resolvedLocation`, which
 * moves once it has loaded). The workspace last shown is kept while the window is on a page outside
 * one (onboarding, Create workspace), so coming back to it from there is not a switch, and going on
 * into another is. The root drops its dialogs and the undo stack meanwhile, as they belong to the
 * workspace closing. The splash is `/app/$workspaceId`'s pending component, not this.
 */
export function useSwitchingWorkspace(): boolean {
  const destinationWorkspaceId = useRouterState({
    select: (state) => workspaceIdOfPage(state.location.pathname),
  });
  const shownWorkspaceId = useRouterState({
    select: (state) =>
      state.resolvedLocation ? workspaceIdOfPage(state.resolvedLocation.pathname) : null,
  });
  const hasShownPage = useRouterState({ select: (state) => state.resolvedLocation !== undefined });
  // the workspace shown last, kept while the window is on a page outside one
  const [lastShownWorkspaceId, setLastShownWorkspaceId] = useState(shownWorkspaceId);
  if (shownWorkspaceId !== null && shownWorkspaceId !== lastShownWorkspaceId) {
    setLastShownWorkspaceId(shownWorkspaceId);
  }
  return (
    hasShownPage &&
    destinationWorkspaceId !== null &&
    destinationWorkspaceId !== (shownWorkspaceId ?? lastShownWorkspaceId)
  );
}
