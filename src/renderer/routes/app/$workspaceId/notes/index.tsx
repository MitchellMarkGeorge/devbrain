import { createFileRoute } from '@tanstack/react-router';
import { NotesPage } from '@renderer/features/notes/components/views/NotesPage';
import { loadNotes } from '@renderer/features/notes/api/loaders';
import { notesSearchSchema } from '@renderer/features/notes/api/search';

// The notes: list or cards, with filters and sort in the URL (?view=card&sort=title).
export const Route = createFileRoute('/app/$workspaceId/notes/')({
  staticData: { title: 'Notes' },
  validateSearch: notesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadNotes(context, deps),
  component: NotesPage,
});
