import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/tasks/')({
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.tasks.list.queryOptions({ limit: 5 })),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.tasks.list.queryOptions({ limit: 5 }));
    return (
      <PlaceholderPage
        path="/app/tasks"
        title="Tasks"
        milestone="milestone 4"
        rows={data.items.map((task) => task.title)}
      />
    );
  },
});
