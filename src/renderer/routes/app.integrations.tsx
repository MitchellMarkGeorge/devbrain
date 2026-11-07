import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/integrations')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.integrations.list.queryOptions()),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.integrations.list.queryOptions());
    return (
      <PlaceholderPage
        path="/app/integrations"
        title="Integrations"
        milestone="milestone 10"
        rows={data.map((integration) => integration.accountLabel)}
      />
    );
  },
});
