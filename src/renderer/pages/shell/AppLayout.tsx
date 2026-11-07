import { useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Link,
  Outlet,
  useMatchRoute,
  useMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  FileText,
  Folder,
  House,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  AppShell,
  Breadcrumb,
  PageHeader,
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
  SidebarWorkspace,
  toast,
  WorkspaceSwitcher,
} from '../../components';
import { swatchOf } from '../workspaces/colors';
import { CreateWorkspaceDialog } from '../workspaces/CreateWorkspaceDialog';
import { useWorkspaceActions } from '../workspaces/workspace-actions';
import { useHeldFor, useShownAfter } from '../../session/use-held-for';
import { PagePending } from './PagePending';

// A page whose loaders take longer than this shows PagePending in its place, for at least
// PENDING_MIN_MS so it doesn't flash; a quicker one shows nothing in between
const PENDING_MS = 150;
const PENDING_MIN_MS = 500;

// The app around a workspace's pages (`/app`): AppShell with the sidebar (the workspace menu, the
// pages, Trash, Settings and Help), the header the page names, and Back and Forward kept within
// the open workspace's pages. Recents, Favorites, the sync line, search and new task come with
// milestone 3.

type AppPath =
  | '/app/home'
  | '/app/tasks'
  | '/app/projects'
  | '/app/notes'
  | '/app/calendar'
  | '/app/integrations'
  | '/app/trash'
  | '/app/settings';

const PAGES: { to: AppPath; label: string; icon: LucideIcon }[] = [
  { to: '/app/home', label: 'Home', icon: House },
  { to: '/app/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/app/projects', label: 'Projects', icon: Folder },
  { to: '/app/notes', label: 'Notes', icon: FileText },
  { to: '/app/calendar', label: 'Calendar', icon: Calendar },
  { to: '/app/integrations', label: 'Integrations', icon: Zap },
];

export function AppLayout() {
  const router = useRouter();
  const { session } = router.options.context;
  const workspace = useSyncExternalStore(session.subscribe, () => session.getState().workspace);
  const location = useRouterState({ select: (state) => state.location });
  // the deepest page's title, for the header
  const title = useMatches({
    select: (matches) =>
      [...matches].reverse().find((match) => match.staticData.title)?.staticData.title,
  });
  const index = location.state.__TSR_index;
  // The router keeps the old page while the next loads (its own pending UI can't show between
  // sibling pages: library-behaviour.test.ts), so the shell shows the skeleton itself
  const loading = useRouterState({ select: (state) => state.isLoading });
  const pending = useHeldFor(useShownAfter(loading, PENDING_MS), PENDING_MIN_MS);

  return (
    <AppShell
      sidebar={<AppSidebar />}
      header={
        title ? (
          <PageHeader>
            <Breadcrumb items={[workspace?.name ?? 'DevBrain', title]} />
          </PageHeader>
        ) : (
          // Home has no title bar content of its own
          <PageHeader />
        )
      }
      onBack={() => session.canGoBack(router.latestLocation) && router.history.back()}
      onForward={() => router.history.forward()}
      canGoBack={session.canGoBack(location)}
      canGoForward={index < router.history.length - 1}
    >
      {pending ? <PagePending /> : <Outlet />}
    </AppShell>
  );
}

function AppSidebar() {
  const matchRoute = useMatchRoute();
  // a page's own pages (a task under Tasks) keep its item active
  const active = (to: AppPath) => matchRoute({ to, fuzzy: true }) !== false;
  const item = (to: AppPath, label: string, icon: LucideIcon) => (
    <SidebarItem key={to} icon={icon} active={active(to)} render={<Link to={to} />}>
      {label}
    </SidebarItem>
  );
  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceMenu />
        <SidebarHeaderActions>
          {/* search (⌘K) and new task (C) come with milestones 3 and 9 */}
          <SidebarAction icon={Search} label="Search" shortcut="⌘K" disabled />
          <SidebarAction icon={SquarePen} label="New task" shortcut="C" disabled />
        </SidebarHeaderActions>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>{PAGES.map(({ to, label, icon }) => item(to, label, icon))}</SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {item('/app/trash', 'Trash', Trash2)}
        {item('/app/settings', 'Settings', Settings)}
        {/* there is no help yet: drawn disabled until there is */}
        <SidebarItem icon={CircleHelp} disabled>
          Help
        </SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

/**
 * The sidebar's workspace menu: switch to another workspace, create one (a dialog: it opens once
 * created), add a folder, or show the open one's folder. A switch shows the splash until the new
 * workspace's page is ready (the session).
 */
function WorkspaceMenu() {
  const { session, trpc } = useRouter().options.context;
  const workspace = useSyncExternalStore(session.subscribe, () => session.getState().workspace);
  const { workspaces, open, openFolder } = useWorkspaceActions();
  const [creating, setCreating] = useState(false);
  const showInFolder = useMutation(
    trpc.workspace.showInFolder.mutationOptions({
      onError: () => toast({ title: 'The workspace’s folder couldn’t be shown', tone: 'error' }),
    }),
  );
  if (!workspace) return null;
  return (
    <>
      <SidebarWorkspace name={workspace.name} color={swatchOf(workspace.color)}>
        <WorkspaceSwitcher
          workspaces={workspaces.map(({ id, name, color }) => ({
            id,
            name,
            color: swatchOf(color),
          }))}
          current={workspace.id}
          onSelect={(id) => {
            const next = workspaces.find((w) => w.id === id);
            if (next) open(next);
          }}
          onCreate={() => setCreating(true)}
          onOpenFolder={openFolder}
          onShowInFinder={() => showInFolder.mutate()}
        />
      </SidebarWorkspace>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
