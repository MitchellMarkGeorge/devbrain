import { Breadcrumb, PageContent, PageToolbar } from '../../../components';
import { PageHeaderSlot } from '../../app/page-header';
import { CLEAR_FILTERS } from '../search';
import { useCreateNote } from '../use-create-note';
import { useNotesSearch } from '../use-notes-search';
import { NotesFilterMenu, NotesToolbarEnd, VIEW_ICONS, VIEW_LABELS } from './NotesToolbar';
import { NotesView } from './NotesViews';

/**
 * The notes page (`/app/$workspaceId/notes`, Figma `7158:11693`, `7158:12276`): the toolbar
 * (Filter, Sort, the view, New Note) over the list or the cards, each reading its state from the
 * URL. New Note creates a note (in the filtered project) and opens it.
 */
export function NotesPage() {
  const { search, resolved, setSearch } = useNotesSearch();
  const createNote = useCreateNote();
  const newNote = () =>
    void createNote({
      projectId: resolved.project && resolved.project !== 'none' ? resolved.project : undefined,
    });
  return (
    <>
      <PageHeaderSlot
        place={
          <Breadcrumb
            items={[
              'Notes',
              { label: VIEW_LABELS[resolved.view], icon: VIEW_ICONS[resolved.view] },
            ]}
          />
        }
      />
      <PageToolbar
        start={<NotesFilterMenu resolved={resolved} setSearch={setSearch} />}
        end={<NotesToolbarEnd resolved={resolved} setSearch={setSearch} onNewNote={newNote} />}
      />
      <PageContent layout="list" data-testid="page" data-view={resolved.view}>
        <NotesView
          resolved={resolved}
          search={search}
          onClearFilters={() => setSearch(CLEAR_FILTERS)}
          onNewNote={newNote}
        />
      </PageContent>
    </>
  );
}
