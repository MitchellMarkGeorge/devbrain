import { Outlet, useRouter } from '@tanstack/react-router';
import { WorkspaceShell, Breadcrumb, PageHeader } from '../../components';
import { AppCommands } from './AppCommands';
import { AppSidebar } from './AppSidebar';
import { PageHeaderProvider, usePageHeaderSlots, useRouteTitle } from './page-header';
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
  return (
    <PageHeaderProvider value={slots}>
      <WorkspaceShell
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
        <AppCommands />
        <Outlet />
      </WorkspaceShell>
    </PageHeaderProvider>
  );
}
