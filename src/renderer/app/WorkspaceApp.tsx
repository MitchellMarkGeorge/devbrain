import { useEffect, useRef, useState } from 'react';
import { createHashHistory, RouterProvider, type RouterHistory } from '@tanstack/react-router';
import type { SerializedError } from '@common/ipc/types';
import { isValidLastPage, type WorkspaceInfo } from '@common/types';
import { toast } from '../components';
import { describeWorkspaceError } from '../pages/onboarding/WorkspaceErrorDialog';
import { createAppRouter, type AppRouter } from '../router';
import { useServices } from './context';
import { landingPage } from './landing-page';

// The window's hash history, one for the page load: each WorkspaceApp's router uses it, rather
// than a new one per mount, which would leave the old one's listeners on the window. The hash
// keeps the location across a reload, and main follows it for "Reopen last page"
// (src/main/runtime/last-page.ts).
let windowHistory: RouterHistory | null = null;
function hashHistory(): RouterHistory {
  windowHistory ??= createHashHistory();
  return windowHistory;
}

/** The location `history` shows, as a path with its search: `/app/tasks?view=board`. */
function locationOf(history: RouterHistory): string {
  const { pathname, search } = history.location;
  return `${pathname}${search}`;
}

/**
 * The window while `workspace` is open: the app's router over the window's history. It starts on
 * the workspace's landing page, unless `keepPage` (a reload into this workspace, or a failed switch
 * that came back to it) and the location is already a page in the app. `error`, why a switch away
 * failed, shows once as a toast.
 */
export function WorkspaceApp({
  workspace,
  error,
  keepPage,
  history = hashHistory(),
  onRouter,
}: {
  workspace: WorkspaceInfo;
  error: SerializedError | null;
  keepPage: boolean;
  history?: RouterHistory;
  onRouter?: (router: AppRouter) => void;
}) {
  const services = useServices();
  const [router] = useState(() => {
    const kept = keepPage && isValidLastPage(locationOf(history));
    if (!kept) {
      const settings = services.queryClient.getQueryData(services.trpc.settings.get.queryKey());
      history.replace(landingPage(settings, workspace));
    }
    return createAppRouter(services, history);
  });
  useEffect(() => {
    onRouter?.(router);
  }, [onRouter, router]);

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
