import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '../pages/app/AppLayout';
import { NotFoundPage } from '../pages/app/NotFoundPage';
import { WorkspaceOpenError } from '../pages/app/WorkspaceOpenError';
import { openWorkspaceOf, parseWorkspaceParams } from '../pages/app/workspace-route';

// Every page in a workspace: /app/<its id>/…. The route opens the workspace its URL names when
// it isn't the open one, under the splash, before any page's loader runs; it does nothing when it
// is (a reload, a navigation within it). See docs/renderer/routing.md.
export const Route = createFileRoute('/app/$workspaceId')({
  params: parseWorkspaceParams,
  beforeLoad: openWorkspaceOf,
  loader: ({ context: { queryClient, trpc } }) =>
    Promise.all([
      queryClient.ensureQueryData(trpc.workspaces.current.queryOptions()),
      queryClient.ensureQueryData(trpc.workspaces.list.queryOptions()),
    ]),
  component: AppLayout,
  // the workspace couldn't be opened: why, and the way back
  errorComponent: WorkspaceOpenError,
  notFoundComponent: NotFoundPage,
});
