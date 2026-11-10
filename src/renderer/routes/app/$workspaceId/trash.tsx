import { createFileRoute } from '@tanstack/react-router';
import { TrashPage } from '../../../pages/trash/TrashPage';
import { trashListQuery } from '../../../pages/trash/queries';
import { trashEntityType, trashSearchSchema } from '../../../pages/trash/search';

// The trash, by kind in ?tab=projects|tasks|notes (every kind without it).
export const Route = createFileRoute('/app/$workspaceId/trash')({
  staticData: { title: 'Trash' },
  validateSearch: trashSearchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.infiniteQuery({
      ...trashListQuery(trashEntityType(deps.tab)),
      staleTime: 'static',
    }),
  component: TrashPage,
});
