import { useNavigate, useParams } from '@tanstack/react-router';
import { createElement } from 'react';
import { createAppCommands, ShortcutsDialog, useCommands, type GoToPage } from '../../keyboard';
import { useModals } from '../../modals';
import { useOpenSearch } from '../search/use-open-search';
import { useCreateTask } from '../tasks/create/use-create-task';

/**
 * Registers the app-wide commands (the default keymap's "Everywhere" keys) while a workspace is
 * open: ⌘K opens search, G H / G T / G P / G N / G C / G I / G S / G X go to a page, C opens
 * Create task, `?` shows the shortcuts, ⌘\ runs `toggleSidebar` (the shell's, through its
 * `controlsRef`). An action not built yet (new note until milestone 5) is left out, so its keys
 * go through. Called by the workspace layout.
 */
export function useAppCommands({ toggleSidebar }: { toggleSidebar: () => void }) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const modals = useModals();
  const createTask = useCreateTask();
  const openSearch = useOpenSearch();
  useCommands(
    createAppCommands({
      openSearch,
      goTo: (page: GoToPage) =>
        void navigate({ to: `/app/$workspaceId/${page}`, params: { workspaceId } }),
      openShortcuts: () => modals.open((props) => createElement(ShortcutsDialog, props)),
      toggleSidebar,
      newTask: () => createTask(),
    }),
  );
}
