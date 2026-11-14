import { createFileRoute } from '@tanstack/react-router';
import { TrashPage } from '@renderer/features/trash/components/TrashPage';
import { trashListQuery } from '@renderer/features/trash/api/queries';
import { trashEntityType, trashSearchSchema } from '@renderer/features/trash/api/search';

// The trash, by kind in ?tab=projects|tasks|notes (every kind without it).
export const Route = createFileRoute('/app/$workspaceId/trash')({
  staticData: { title: 'Trash' },
  validateSearch: trashSearchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  // the tab's rows, and for a tab of one kind the whole trash's first page too: Empty Trash needs
  // to know whether anything is in the trash before the page draws
  loader: ({ context: { queryClient }, deps }) =>
    Promise.all(
      [...new Set([trashEntityType(deps.tab), 'all' as const])].map((entityType) =>
        queryClient.infiniteQuery({ ...trashListQuery(entityType), staleTime: 'static' }),
      ),
    ),
  component: TrashPage,
});
