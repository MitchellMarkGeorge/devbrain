import { useEffect, useRef } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import type { SerializedError } from '@common/ipc/types';
import { toast } from '../components';
import { describeWorkspaceError } from '../pages/onboarding/WorkspaceErrorDialog';
import type { AppRouter } from '../router';

/**
 * The window while a workspace is open: the app's router, already on the right page
 * (placeRouters). `error`, why a switch away failed, shows once as a toast.
 */
export function WorkspaceApp({
  router,
  error,
}: {
  router: AppRouter;
  error: SerializedError | null;
}) {
  // once, though effects run twice in development
  const shownError = useRef<SerializedError | null>(null);
  useEffect(() => {
    if (error === null || shownError.current === error) return;
    shownError.current = error;
    const { title, description } = describeWorkspaceError(error);
    toast({ tone: 'error', title, description });
  }, [error]);

  return <RouterProvider router={router} />;
}
