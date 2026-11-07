import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/trash')({
  staticData: { title: 'Trash' },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.archive.listArchived.queryOptions({ limit: 5 })),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.archive.listArchived.queryOptions({ limit: 5 }));
    return (
      <PlaceholderPage
        path="/app/trash"
        title="Trash"
        milestone="milestone 10"
        rows={data.items.map((item) => item.title)}
      />
    );
  },
});
