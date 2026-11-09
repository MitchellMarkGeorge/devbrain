import { useNavigate, useParams } from '@tanstack/react-router';
import { useWorkspaceShell } from '../../components';
import { createAppCommands, ShortcutsDialog, useCommands, type GoToPage } from '../../keyboard';
import { useModals } from '../../modals';

/**
 * The app-wide commands (the default keymap's "Everywhere" keys), registered while a workspace is
 * open: G H / G T / G P / G N / G C / G I / G S / G X go to a page, `?` shows the shortcuts, ⌘\ toggles the sidebar.
 * Rendered inside the `WorkspaceShell`, whose sidebar toggle it runs. An action not built yet
 * (search until milestone 9, new note until milestone 5) is left out, so its keys go through.
 */
export function AppCommands() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const navigate = useNavigate();
  const modals = useModals();
  const { toggleSidebar } = useWorkspaceShell();
  useCommands(
    createAppCommands({
      goTo: (page: GoToPage) =>
        void navigate({ to: `/app/$workspaceId/${page}`, params: { workspaceId } }),
      openShortcuts: () => modals.open((props) => <ShortcutsDialog {...props} />),
      toggleSidebar,
    }),
  );
  return null;
}
