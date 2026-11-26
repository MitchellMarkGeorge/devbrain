import { PageContent, PageToolbar, Page } from '@renderer/components';
import { CLEAR_FILTERS } from '../api/search';
import { useCreateNote } from '../hooks/use-create-note';
import { useNotesSearch } from '../hooks/use-notes-search';
import { NotesToolbarEnd, NotesToolbarStart } from '../components/views/NotesToolbar';
import { NotesView } from '../components/views/NotesViews';

/**
 * The notes page (`/app/$workspaceId/notes`, Figma `7158:11693`, `7158:12276`): the toolbar
 * (the filters and Display) over the list or the cards, each reading its state from the URL. The
 * empty page's New Note creates a note and opens it; otherwise the title bar's New does.
 */
export function NotesPage() {
  const { search, resolved, setSearch } = useNotesSearch();
  const createNote = useCreateNote();
  const newNote = () => createNote();
  return (
    <Page title="Notes">
      <PageToolbar
        start={<NotesToolbarStart resolved={resolved} setSearch={setSearch} />}
        end={<NotesToolbarEnd resolved={resolved} setSearch={setSearch} />}
      />
      <PageContent layout="list" data-testid="page" data-view={resolved.view}>
        <NotesView
          resolved={resolved}
          search={search}
          onClearFilters={() => setSearch(CLEAR_FILTERS)}
          onNewNote={newNote}
        />
      </PageContent>
    </Page>
  );
}
