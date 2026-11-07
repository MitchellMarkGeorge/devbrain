import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/notes/')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.notes.list.queryOptions({ limit: 5 })),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.notes.list.queryOptions({ limit: 5 }));
    return (
      <PlaceholderPage
        path="/app/notes"
        title="Notes"
        milestone="milestone 5"
        rows={data.items.map((note) => note.title)}
      />
    );
  },
});
