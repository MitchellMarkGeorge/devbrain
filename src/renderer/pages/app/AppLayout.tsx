import { useRef } from 'react';
import { Outlet, useRouter } from '@tanstack/react-router';
import {
  WorkspaceShell,
  Breadcrumb,
  PageHeader,
  type WorkspaceShellControls,
} from '../../components';
import { ModeLine, useCommands, useKeymap } from '../../keyboard';
import { AppSidebar } from './AppSidebar';
import { PageHeaderProvider, usePageHeaderSlots, useRouteTitle } from './page-header';
import { useAppCommands } from './use-app-commands';
import { useHistoryPosition } from './use-history-position';

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
  // Back and forward, as the window row's arrows (Vim's Ctrl-o / Ctrl-i)
  useCommands([
    {
      id: 'nav.back',
      title: 'Back',
      scope: 'global',
      run: () => router.history.back(),
      enabled: () => position.canGoBack,
    },
    {
      id: 'nav.forward',
      title: 'Forward',
      scope: 'global',
      run: () => router.history.forward(),
      enabled: () => position.canGoForward,
    },
  ]);
  // a keymap with modes (Vim) shows them in the mode line
  const modal = useKeymap().modes !== undefined;
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
        statusLine={modal ? <ModeLine context={title} /> : undefined}
      >
        <Outlet />
      </WorkspaceShell>
    </PageHeaderProvider>
  );
}
