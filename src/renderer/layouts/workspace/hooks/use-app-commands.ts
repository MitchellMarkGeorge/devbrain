import { useNavigate, useParams } from '@tanstack/react-router';
import { createElement } from 'react';
import { createAppCommands, ShortcutsDialog, useCommands, type GoToPage } from '@renderer/keyboard';
import { useModals } from '@renderer/app/modals';
import { useCreateNote } from '@renderer/features/notes/hooks/use-create-note';
import { useOpenSearch } from '@renderer/features/search/hooks/use-open-search';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import { useCreateProject } from '@renderer/features/projects/hooks/use-create-project';

/**
 * Registers the app-wide commands (the default keymap's "Everywhere" keys) while a workspace is
 * open: ⌘K opens search, G H / G T / G P / G N / G C / G I / G S / G X go to a page, C opens
 * Create task, N creates a note and opens it (New project has no key: ⌘K lists it), `?` shows
 * the shortcuts, ⌘\ runs `toggleSidebar` (the shell's, through its `controlsRef`). Called by the
 * workspace layout, which gives the search each section was last shown with (`searchOf`): a key
 * goes to a section as its sidebar link does.
 */
export function useAppCommands({
  toggleSidebar,
  searchOf,
}: {
  toggleSidebar: () => void;
  /** a page's search as it was last shown (the root layout keeps them), by its path */
  searchOf: (pathname: string) => Record<string, unknown> | undefined;
}) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const modals = useModals();
  const createTask = useCreateTask();
  const createNote = useCreateNote();
  const openSearch = useOpenSearch();
  const createProject = useCreateProject();
  useCommands(
    createAppCommands({
      openSearch,
      // Integrations is a section of the settings; Settings opens on their first section
      goTo: (page: GoToPage) =>
        navigate({
          to:
            page === 'integrations'
              ? '/app/$workspaceId/settings/integrations'
              : page === 'settings'
                ? '/app/$workspaceId/settings/general'
                : `/app/$workspaceId/${page}`,
          params: { workspaceId },
          // a section with its view and filters as they were left, as its sidebar link shows it
          search: searchOf(`/app/${workspaceId}/${page}`) ?? {},
        }),
      openShortcuts: () => modals.open((props) => createElement(ShortcutsDialog, props)),
      toggleSidebar,
      newTask: () => createTask(),
      newNote: () => {
        createNote();
      },
      newProject: () => createProject(),
    }),
  );
}
