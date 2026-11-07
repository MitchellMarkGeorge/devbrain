import { RouterProvider } from '@tanstack/react-router';
import type { SerializedError } from '@common/ipc/types';
import {
  WorkspaceActionsProvider,
  WorkspaceErrorDialog,
} from '../pages/onboarding/WorkspaceErrorDialog';
import type { AppRouter } from '../router';

/**
 * The window while no workspace is open: the onboarding pages (`/onboarding/*`) on their own
 * router, back at Welcome (placeRouters), with the workspace actions and their error dialog around
 * them. `error` is why the last open failed.
 */
export function OnboardingApp({
  router,
  error,
}: {
  router: AppRouter;
  error: SerializedError | null;
}) {
  return (
    <WorkspaceActionsProvider initialFailure={error}>
      <RouterProvider router={router} />
      <WorkspaceErrorDialog />
    </WorkspaceActionsProvider>
  );
}
