import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { idOrNotFound, loadOrNotFound } from '../../../app/detail';
import { PlaceholderPage } from '../../../app/pages';

export const Route = createFileRoute('/app/tasks/$taskId')({
  loader: ({ context: { queryClient, trpc }, params }) =>
    loadOrNotFound(
      queryClient.ensureQueryData(
        trpc.tasks.get.queryOptions({ id: idOrNotFound('task', params.taskId) }),
      ),
    ),
  component: Detail,
});

function Detail() {
  const { trpc } = Route.useRouteContext();
  const { taskId } = Route.useParams();
  const entity = useQuery(trpc.tasks.get.queryOptions({ id: idOrNotFound('task', taskId) }));
  return <PlaceholderPage crumbs={['Tasks', entity.data?.title ?? '']} icon={CircleCheck} />;
}
