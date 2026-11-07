import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/calendar')({
  staticData: { title: 'Calendar' },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.calendars.list.queryOptions()),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.calendars.list.queryOptions());
    return (
      <PlaceholderPage
        path="/app/calendar"
        title="Calendar"
        milestone="milestone 7"
        rows={data.map((calendar) => calendar.name)}
      />
    );
  },
});
