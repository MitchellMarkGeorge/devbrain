import { useState } from 'react';
import { Outlet, useMatches, useRouter } from '@tanstack/react-router';
import { AppShell, Breadcrumb, PageHeader } from '../../components';
import { CreateWorkspaceDialog } from '../workspaces/CreateWorkspaceDialog';
import { AppSidebar } from './AppSidebar';
import { useHistoryPosition } from './use-history-position';

/**
 * Every page in a workspace: the shell with the sidebar, the page's header, the window bar's back
 * and forward on the router's history, and the page.
 */
export function AppLayout() {
  const router = useRouter();
  const position = useHistoryPosition();
  const [creating, setCreating] = useState(false);
  const title = useMatches({
    select: (matches) =>
      [...matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });
  return (
    <AppShell
      sidebar={<AppSidebar onNewWorkspace={() => setCreating(true)} />}
      header={<PageHeader>{title && <Breadcrumb items={[title]} />}</PageHeader>}
      onBack={() => router.history.back()}
      onForward={() => router.history.forward()}
      canGoBack={position.canGoBack}
      canGoForward={position.canGoForward}
    >
      <Outlet />
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
  );
}
