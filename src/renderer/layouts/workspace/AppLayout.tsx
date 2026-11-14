import { useRef } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import { WorkspaceShell, type WorkspaceShellControls } from '@renderer/components';
import { AppSidebar } from './AppSidebar';
import { useAppCommands } from './hooks/use-app-commands';
import { useHistoryPosition } from '@renderer/shared/hooks/use-history-position';

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
