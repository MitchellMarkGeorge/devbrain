import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '../pages/app/AppLayout';
import { NotFoundPage } from '../pages/app/NotFoundPage';
import { WorkspaceOpenError } from '../pages/app/WorkspaceOpenError';
import { Splash } from '../pages/root/Splash';
import { openWorkspaceOf, parseWorkspaceParams } from '../pages/app/workspace-route';

// Every page in a workspace: /app/<its id>/…. The route opens the workspace its URL names when
// it isn't the open one, with the splash in its place, before any page's loader runs; it does
// nothing when it is (a reload, a navigation within it). See docs/renderer/routing.md.
export const Route = createFileRoute('/app/$workspaceId')({
  params: parseWorkspaceParams,
  beforeLoad: openWorkspaceOf,
  loader: ({ context: { queryClient, trpc } }) =>
    Promise.all([
      queryClient.ensureQueryData(trpc.workspaces.current.queryOptions()),
      queryClient.ensureQueryData(trpc.workspaces.list.queryOptions()),
    ]),
  component: AppLayout,
  // the splash while the workspace opens and its first page loads: a switch from another
  // workspace's page changes this route's params, so it loads again; a navigation within one
  // doesn't, and a slow page shows PagePending instead. Shown at once, for the router's minimum
  pendingComponent: Splash,
  pendingMs: 0,
  // the workspace couldn't be opened: why, and the way back
  errorComponent: WorkspaceOpenError,
  notFoundComponent: NotFoundPage,
});
