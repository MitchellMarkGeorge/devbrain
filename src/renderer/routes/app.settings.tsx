import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/settings')({
  staticData: { title: 'Settings' },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.settings.get.queryOptions()),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.settings.get.queryOptions());
    return (
      <PlaceholderPage
        path="/app/settings"
        title="Settings"
        milestone="milestone 10"
        rows={[`Opens on ${data.general.defaultLandingPage}`]}
      />
    );
  },
});
