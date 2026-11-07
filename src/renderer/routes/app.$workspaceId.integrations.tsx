import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPage, pageQueries } from '../pages/app/placeholders';

export const Route = createFileRoute('/app/$workspaceId/integrations')({
  staticData: { title: 'Integrations' },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(pageQueries.integrations()),
  component: IntegrationsPage,
});
