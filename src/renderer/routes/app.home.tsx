import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/home')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.recents.list.queryOptions({ limit: 5 })),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.recents.list.queryOptions({ limit: 5 }));
    return (
      <PlaceholderPage
        path="/app/home"
        title="Home"
        header="none"
        milestone="milestone 8"
        rows={data.items.map((recent) => recent.entity.title)}
      />
    );
  },
});
