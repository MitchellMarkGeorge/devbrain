import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useParams, useRouter, useRouterState } from '@tanstack/react-router';
import { WorkspaceShell, type WorkspaceShellControls } from '@renderer/components';
import { useOpenSearch } from '@renderer/features/search/hooks/use-open-search';
import { useCreateTask } from '@renderer/features/tasks/hooks/use-create-task';
import { AppSidebar } from './AppSidebar';
import { CreateMenu } from './CreateMenu';
import { WorkspaceMenu } from './WorkspaceMenu';
import { SettingsSidebar } from './SettingsSidebar';
import { useTransferCommands } from '@renderer/features/settings/hooks/use-transfers';
import { useAppCommands } from './hooks/use-app-commands';
import { useMenuCommands } from './hooks/use-menu-commands';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import { useModalShown } from '@renderer/app/modals';
import { PillCardsProvider } from '@renderer/shared/components/PillCards';
import {
  NewTaskDialogContext,
  type OpenNewTaskDialog,
} from '@renderer/shared/hooks/use-workspace-editor-host';

/**
 * Every page in a workspace: the shell with the sidebar; in its title bar the workspace menu, back
 * and forward on the router's history, search (the field opens it, as ⌘K does) and New; the app-wide commands (from the keys and the app menu), import and export
 * (for the app menu), and the page. Each page declares its own title and actions (its `Page`'s), so
 * the layout holds nothing of the page's; it gives the pills in the page's rows their hover cards
 * (`PillCardsProvider`), and the page's editors the New task dialog for "/task"
 * (`NewTaskDialogContext`). While the settings are open the sidebar is
 * theirs (`SettingsSidebar`), whose Back to app returns to the last page outside them.
 */
export function AppLayout() {
  const router = useRouter();
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  // the page shown, once loaded (not one still loading, nor a /settings about to redirect)
  const shown = useRouterState({ select: (state) => state.resolvedLocation ?? state.location });
  const inSettings = shown.pathname.startsWith(`/app/${workspaceId}/settings`);
  // the last page outside the settings, for Back to app (Home when they were opened first)
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (!inSettings) lastPage.current = shown.href;
  }, [inSettings, shown.href]);
  const backToApp = () => {
    if (lastPage.current) void router.navigate({ href: lastPage.current });
    else void router.navigate({ to: '/app/$workspaceId/home', params: { workspaceId } });
  };
  const position = useHistoryPosition();
  const openSearch = useOpenSearch();
  // the app-wide keys; ⌘\ toggles the shell's sidebar
  const shell = useRef<WorkspaceShellControls>(null);
  useAppCommands({ toggleSidebar: () => shell.current?.toggleSidebar() });
  // import and export, as commands, for the app menu; then the menu's commands, from main
  useTransferCommands();
  useMenuCommands();
  // a dialog (search, a create dialog, a confirmation) closes the sidebar's drawer, peeking or
  // pinned: the dialog is what the user turned to, and it shouldn't open over a sheet left open.
  // Before paint, so the two never show together
  const createTask = useCreateTask();
  const openNewTaskDialog = useCallback<OpenNewTaskDialog>(
    (defaults) => createTask({ defaults }),
    [createTask],
  );
  const modalShown = useModalShown();
  useLayoutEffect(() => {
    if (modalShown) shell.current?.closeDrawer();
  }, [modalShown]);
  return (
    <WorkspaceShell
      controlsRef={shell}
      sidebar={inSettings ? <SettingsSidebar onBack={backToApp} /> : <AppSidebar />}
      onBack={() => router.history.back()}
      onForward={() => router.history.forward()}
      canGoBack={position.canGoBack}
      canGoForward={position.canGoForward}
      workspace={<WorkspaceMenu />}
      onSearch={openSearch}
      create={<CreateMenu />}
    >
      <PillCardsProvider>
        <NewTaskDialogContext.Provider value={openNewTaskDialog}>
          <Outlet />
        </NewTaskDialogContext.Provider>
      </PillCardsProvider>
    </WorkspaceShell>
  );
}
