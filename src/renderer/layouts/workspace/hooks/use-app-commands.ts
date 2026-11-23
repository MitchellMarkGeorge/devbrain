import { useNavigate, useParams } from '@tanstack/react-router';
import { createElement } from 'react';
import { createAppCommands, ShortcutsDialog, useCommands, type GoToPage } from '@renderer/keyboard';
import { useModals } from '@renderer/app/modals';
import { useCreateNote } from '@renderer/features/notes/hooks/use-create-note';
import { useOpenSearch } from '@renderer/features/search/hooks/use-open-search';
import { useCreateTaskHere } from '@renderer/features/tasks/hooks/use-create-task';
import { useCreateProject } from '@renderer/features/projects/hooks/use-create-project';

/**
 * Registers the app-wide commands (the default keymap's "Everywhere" keys) while a workspace is
 * open: ⌘K opens search, G H / G T / G P / G N / G C / G I / G S / G X go to a page, C opens
 * Create task (in the page's project, `useCreateTaskHere`), N creates a note and opens it (New project has no key: ⌘K lists it), `?` shows
 * the shortcuts, ⌘\ runs `toggleSidebar` (the shell's, through its `controlsRef`). Called by the
 * workspace layout.
 */
export function useAppCommands({ toggleSidebar }: { toggleSidebar: () => void }) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const modals = useModals();
  const createTaskHere = useCreateTaskHere();
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
        }),
      openShortcuts: () => modals.open((props) => createElement(ShortcutsDialog, props)),
      toggleSidebar,
      newTask: createTaskHere,
      newNote: () => {
        createNote();
      },
      newProject: () => createProject(),
    }),
  );
}
