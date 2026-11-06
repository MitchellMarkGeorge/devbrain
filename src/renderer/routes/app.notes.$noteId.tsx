import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { idOrNotFound, loadOrNotFound } from '../app/detail';
import { PlaceholderPage } from '../app/pages';

export const Route = createFileRoute('/app/notes/$noteId')({
  loader: ({ context: { queryClient, trpc }, params }) =>
    loadOrNotFound(
      queryClient.ensureQueryData(
        trpc.notes.get.queryOptions({ id: idOrNotFound('note', params.noteId) }),
      ),
    ),
  component: Detail,
});

function Detail() {
  const { trpc } = Route.useRouteContext();
  const { noteId } = Route.useParams();
  const entity = useQuery(trpc.notes.get.queryOptions({ id: idOrNotFound('note', noteId) }));
  return <PlaceholderPage crumbs={['Notes', entity.data?.title ?? '']} icon={FileText} />;
}
