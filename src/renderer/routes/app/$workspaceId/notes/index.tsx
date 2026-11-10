import { createFileRoute } from '@tanstack/react-router';
import { NotesPage } from '../../../../pages/notes/views/NotesPage';
import { loadNotes } from '../../../../pages/notes/loaders';
import { notesSearchSchema } from '../../../../pages/notes/search';

// The notes: list or cards, with filters and sort in the URL (?view=card&sort=title).
export const Route = createFileRoute('/app/$workspaceId/notes/')({
  staticData: { title: 'Notes' },
  validateSearch: notesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadNotes(context, deps),
  component: NotesPage,
});
