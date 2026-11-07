import { useEffect, useState } from 'react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import type { SerializedError } from '@common/ipc/types';
import {
  WorkspaceActionsProvider,
  WorkspaceErrorDialog,
} from '../pages/onboarding/WorkspaceErrorDialog';
import { createAppRouter, type AppRouter } from '../router';
import { useServices } from './context';

/**
 * The window while no workspace is open: the onboarding pages (`/onboarding/*`, which navigate
 * between each other) on a router of their own over memory history, so the window's hash, which
 * main follows for "Reopen last page", is left alone. `error` is why the last open failed.
 */
export function OnboardingApp({
  error,
  onRouter,
}: {
  error: SerializedError | null;
  onRouter?: (router: AppRouter) => void;
}) {
  const services = useServices();
  const [router] = useState(() =>
    createAppRouter(services, createMemoryHistory({ initialEntries: ['/onboarding'] })),
  );
  useEffect(() => {
    onRouter?.(router);
  }, [onRouter, router]);
  return (
    <WorkspaceActionsProvider initialFailure={error}>
      <RouterProvider router={router} />
      <WorkspaceErrorDialog />
    </WorkspaceActionsProvider>
  );
}
