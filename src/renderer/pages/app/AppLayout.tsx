import { useRef } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import {
  WorkspaceShell,
  Breadcrumb,
  PageHeader,
  type WorkspaceShellControls,
} from '../../components';
import { AppSidebar } from './AppSidebar';
import { PageHeaderProvider, usePageHeaderSlots, useRouteTitle } from './page-header';
import { useAppCommands } from './use-app-commands';
import { useHistoryPosition } from './use-history-position';
import { usePageFocus } from './use-page-focus';

/**
 * Every page in a workspace: the shell with the sidebar, the page's header, the window bar's back
 * and forward on the router's history, the app-wide commands, and the page. The header shows the
 * route's title until the page fills it (`PageHeaderSlot`: its breadcrumb and actions).
 */
export function AppLayout() {
  const router = useRouter();
  const position = useHistoryPosition();
  const title = useRouteTitle();
  const { value: slots, setPlace, setActions } = usePageHeaderSlots();
  // the app-wide keys; ⌘\ toggles the shell's sidebar
  const shell = useRef<WorkspaceShellControls>(null);
  useAppCommands({ toggleSidebar: () => shell.current?.toggleSidebar() });
  // a new page takes focus when the old one took it away
  usePageFocus();
  return (
    <PageHeaderProvider value={slots}>
      <WorkspaceShell
        controlsRef={shell}
        sidebar={<AppSidebar />}
        header={
          <PageHeader
            placeRef={setPlace}
            actionsRef={setActions}
            fallback={title && <Breadcrumb items={[title]} />}
          />
        }
        onBack={() => router.history.back()}
        onForward={() => router.history.forward()}
        canGoBack={position.canGoBack}
        canGoForward={position.canGoForward}
      >
        <Outlet />
      </WorkspaceShell>
    </PageHeaderProvider>
  );
}
