import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPage } from '@renderer/features/integrations/page/IntegrationsPage';

// The workspace's connected accounts and their sources.
export const Route = createFileRoute('/app/$workspaceId/integrations')({
  staticData: { title: 'Integrations' },
  loader: ({ context: { queryClient, trpc } }) =>
    Promise.all([
      queryClient.query({ ...trpc.integrations.list.queryOptions(), staleTime: 'static' }),
      queryClient.query({ ...trpc.sync.status.queryOptions(), staleTime: 'static' }),
    ]),
  component: IntegrationsPage,
});
