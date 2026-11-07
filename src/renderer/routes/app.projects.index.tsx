import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';

export const Route = createFileRoute('/app/projects/')({
  staticData: { title: 'Projects' },
  loader: ({ context: { queryClient, trpc } }) =>
    queryClient.ensureQueryData(trpc.projects.list.queryOptions({ limit: 5 })),
  component: function Page() {
    const { trpc } = Route.useRouteContext();
    const { data } = useSuspenseQuery(trpc.projects.list.queryOptions({ limit: 5 }));
    return (
      <PlaceholderPage
        path="/app/projects"
        title="Projects"
        milestone="milestone 6"
        rows={data.items.map((project) => project.title)}
      />
    );
  },
});
