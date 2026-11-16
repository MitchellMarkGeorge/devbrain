import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPage } from '@renderer/features/integrations/page/IntegrationsPage';

// The open workspace's connected accounts and their sources, a section of its settings.
export const Route = createFileRoute('/app/$workspaceId/settings/integrations')({
  loader: ({ context: { queryClient, trpc } }) =>
    Promise.all([
      queryClient.query({ ...trpc.integrations.list.queryOptions(), staleTime: 'static' }),
      queryClient.query({ ...trpc.sync.status.queryOptions(), staleTime: 'static' }),
    ]),
  component: IntegrationsPage,
});
