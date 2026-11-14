import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '@renderer/layouts/workspace/AppLayout';
import { NotFoundPage } from '@renderer/shared/components/NotFoundPage';
import { Splash, SPLASH_DELAY_MS } from '@renderer/app/Splash';
import { WorkspaceOpenError } from '@renderer/layouts/workspace/WorkspaceOpenError';
import { openWorkspaceOf, parseWorkspaceParams } from '@renderer/app/workspace-route';

// Every page in a workspace: /app/<its id>/…. The route opens the workspace its URL names when
// it isn't the open one, before any page's loader runs, with the splash as its pending component;
// it does nothing when it is (a reload, a navigation within it). See docs/renderer/routing.md.
export const Route = createFileRoute('/app/$workspaceId')({
  params: parseWorkspaceParams,
  beforeLoad: openWorkspaceOf,
  loader: ({ context: { queryClient, trpc } }) =>
    Promise.all([
      queryClient.query({ ...trpc.workspaces.current.queryOptions(), staleTime: 'static' }),
      queryClient.query({ ...trpc.workspaces.list.queryOptions(), staleTime: 'static' }),
    ]),
  component: AppLayout,
  // shows once a load takes SPLASH_DELAY_MS, which only an open does; the open itself holds it for
  // SPLASH_MINIMUM_MS, so it needs no minimum of its own
  pendingComponent: Splash,
  pendingMs: SPLASH_DELAY_MS,
  pendingMinMs: 0,
  // the old workspace's page stays mounted, hidden, under the splash; once it goes, the new
  // workspace's pages mount fresh rather than carry the old one's state over
  remountDeps: ({ params }) => params.workspaceId,
  // the workspace couldn't be opened: why, and the way back
  errorComponent: WorkspaceOpenError,
  notFoundComponent: NotFoundPage,
});
