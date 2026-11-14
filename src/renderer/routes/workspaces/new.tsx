import { createFileRoute } from '@tanstack/react-router';
import { CreateWorkspacePage } from '@renderer/features/workspaces/components/CreateWorkspacePage';

// Create workspace, a page of its own outside any workspace: from Welcome when none is open, and
// from the app's workspace menu, over the workspace still open behind it. Its URL names none, so
// nothing opens or closes until the new one is created. See docs/renderer/routing.md.
export const Route = createFileRoute('/workspaces/new')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.query({ ...trpc.workspaces.current.queryOptions(), staleTime: 'static' }),
  component: CreateWorkspacePage,
});
