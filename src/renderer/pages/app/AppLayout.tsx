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
import { useMenuTransferReports } from '../settings/transfer-reports';
import { useAppCommands } from './use-app-commands';
import { useHistoryPosition } from './use-history-position';
import { useMenuCommands } from './use-menu-commands';

/**
 * Every page in a workspace: the shell with the sidebar, the page's header, the window bar's back
 * and forward on the router's history, the app-wide commands (from the keys and the app menu), the
 * app menu's import and export reports, and the page. The header shows the
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
  // the app menu's commands, and what its imports and exports did
  useMenuCommands();
  useMenuTransferReports();
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
