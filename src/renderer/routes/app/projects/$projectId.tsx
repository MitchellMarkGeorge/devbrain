import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Folder } from 'lucide-react';
import { idOrNotFound, loadOrNotFound } from '../../../app/detail';
import { PlaceholderPage } from '../../../app/pages';
import { projectSearch } from '../../../pages/projects/search';

export const Route = createFileRoute('/app/projects/$projectId')({
  validateSearch: projectSearch,
  loader: ({ context: { queryClient, trpc }, params }) =>
    loadOrNotFound(
      queryClient.ensureQueryData(
        trpc.projects.get.queryOptions({ id: idOrNotFound('project', params.projectId) }),
      ),
    ),
  component: Detail,
});

function Detail() {
  const { trpc } = Route.useRouteContext();
  const { projectId } = Route.useParams();
  const entity = useQuery(
    trpc.projects.get.queryOptions({ id: idOrNotFound('project', projectId) }),
  );
  return <PlaceholderPage crumbs={['Projects', entity.data?.title ?? '']} icon={Folder} />;
}
