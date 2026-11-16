import { useLayoutEffect, useRef } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import { WorkspaceShell, type WorkspaceShellControls } from '@renderer/components';
import { AppSidebar } from './AppSidebar';
import { useAppCommands } from './hooks/use-app-commands';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';
import { useModalShown } from '@renderer/app/modals';

/**
 * Every page in a workspace: the shell with the sidebar, the window bar's back and forward on the
 * router's history, the app-wide commands, and the page. Each page draws its own header (a `Page`
 * with a `PageHeader`, or none), so the layout holds nothing of the page's.
 */
export function AppLayout() {
  const router = useRouter();
  const position = useHistoryPosition();
  // the app-wide keys; ⌘\ toggles the shell's sidebar
  const shell = useRef<WorkspaceShellControls>(null);
  useAppCommands({ toggleSidebar: () => shell.current?.toggleSidebar() });
  // a dialog (search, a create dialog, a confirmation) closes the sidebar's drawer, peeking or
  // pinned: the dialog is what the user turned to, and it shouldn't open over a sheet left open.
  // Before paint, so the two never show together
  const modalShown = useModalShown();
  useLayoutEffect(() => {
    if (modalShown) shell.current?.closeDrawer();
  }, [modalShown]);
  return (
    <WorkspaceShell
      controlsRef={shell}
      sidebar={<AppSidebar />}
      onBack={() => router.history.back()}
      onForward={() => router.history.forward()}
      canGoBack={position.canGoBack}
      canGoForward={position.canGoForward}
    >
      <Outlet />
    </WorkspaceShell>
  );
}
