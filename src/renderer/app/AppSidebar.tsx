import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useMatchRoute } from '@tanstack/react-router';
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
import type { WorkspaceId } from '@common/ids';
import { TaskStatus } from '@common/types';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@main/ipc/router';
import {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
  SidebarWorkspace,
  StatusIcon,
  toast,
  WorkspaceSwitcher,
  type TaskStatus as TaskStatusName,
} from '../components';
import { CreateWorkspaceDialog } from '../pages/onboarding/CreateWorkspaceForm';
import { describeWorkspaceError } from '../pages/onboarding/WorkspaceErrorDialog';
import { ipcFailureOf } from '../ipc/errors';
import { useServices } from './context';
import { safeColor, swatchOf } from './swatches';

// how many Recents and Favorites the sidebar lists
const SIDEBAR_LIST_LIMIT = 5;

const NAV = [
  { to: '/app/home', label: 'Home', icon: House },
  { to: '/app/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/app/projects', label: 'Projects', icon: Folder },
  { to: '/app/notes', label: 'Notes', icon: FileText },
  { to: '/app/calendar', label: 'Calendar', icon: Calendar },
  { to: '/app/integrations', label: 'Integrations', icon: Zap },
] as const;

type Outputs = inferRouterOutputs<AppRouter>;
// a row of Recents or Favorites, as it comes over IPC
type Entry =
  | Outputs['recents']['list']['items'][number]
  | Outputs['favorites']['list']['items'][number];

const STATUS_NAMES: Record<TaskStatus, TaskStatusName> = {
  [TaskStatus.NOT_STARTED]: 'not-started',
  [TaskStatus.IN_PROGRESS]: 'in-progress',
  [TaskStatus.COMPLETED]: 'completed',
  [TaskStatus.CANCELLED]: 'cancelled',
};

/**
 * The app's sidebar: the workspace menu, Search and New task, the pages, Recents and Favorites,
 * then Trash, Settings and Help (disabled until there is help). Search and New task open dialogs
 * the app doesn't have yet, so they are disabled too.
 */
export function AppSidebar() {
  const matchRoute = useMatchRoute();
  // a detail page keeps its section active
  const active = (to: string) => matchRoute({ to, fuzzy: true }) !== false;
  return (
    <Sidebar>
      <SidebarHeader>
        <WorkspaceMenu />
        <SidebarHeaderActions>
          <SidebarAction icon={Search} label="Search" shortcut="⌘K" disabled />
          <SidebarAction icon={SquarePen} label="New task" shortcut="C" disabled />
        </SidebarHeaderActions>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {NAV.map(({ to, label, icon }) => (
            <SidebarItem key={to} icon={icon} active={active(to)} render={<Link to={to} />}>
              {label}
            </SidebarItem>
          ))}
        </SidebarGroup>
        <StampedList label="Recents" stamp="viewedAt" />
        <StampedList label="Favorites" stamp="favoritedAt" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarItem icon={Trash2} active={active('/app/trash')} render={<Link to="/app/trash" />}>
          Trash
        </SidebarItem>
        <SidebarItem
          icon={Settings}
          active={active('/app/settings')}
          render={<Link to="/app/settings" />}
        >
          Settings
        </SidebarItem>
        <SidebarItem icon={CircleHelp} disabled>
          Help
        </SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

/** Recents or Favorites, hidden while empty (a new workspace has neither). */
function StampedList({ label, stamp }: { label: string; stamp: 'viewedAt' | 'favoritedAt' }) {
  const { trpc } = useServices();
  const input = { limit: SIDEBAR_LIST_LIMIT };
  const recents = useQuery({
    ...trpc.recents.list.queryOptions(input),
    enabled: stamp === 'viewedAt',
  });
  const favorites = useQuery({
    ...trpc.favorites.list.queryOptions(input),
    enabled: stamp === 'favoritedAt',
  });
  const items: readonly Entry[] =
    (stamp === 'viewedAt' ? recents.data?.items : favorites.data?.items) ?? [];
  if (items.length === 0) return null;
  return (
    <SidebarGroup label={label}>
      {items.map((item) => (
        <StampedItem key={item.entity.id} item={item} />
      ))}
    </SidebarGroup>
  );
}

function StampedItem({ item }: { item: Entry }) {
  let link: ReactElement;
  switch (item.entityType) {
    case 'tasks':
      link = <Link to="/app/tasks/$taskId" params={{ taskId: item.entity.id }} />;
      return (
        <SidebarItem icon={<StatusIcon status={STATUS_NAMES[item.entity.status]} />} render={link}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'projects':
      link = <Link to="/app/projects/$projectId" params={{ projectId: item.entity.id }} />;
      return (
        <SidebarItem icon={Folder} iconColor={safeColor(item.entity.color)} render={link}>
          {item.entity.title}
        </SidebarItem>
      );
    case 'notes':
      link = <Link to="/app/notes/$noteId" params={{ noteId: item.entity.id }} />;
      return (
        <SidebarItem icon={FileText} render={link}>
          {item.entity.title || 'Untitled'}
        </SidebarItem>
      );
    case 'events':
      // events have no page: the calendar opens them in its sheet
      link = <Link to="/app/calendar" search={{ open: item.entity.id }} />;
      return (
        <SidebarItem bar={safeColor(item.entity.color) ?? 'var(--muted-foreground)'} render={link}>
          {item.entity.title}
        </SidebarItem>
      );
  }
}

/**
 * The workspace menu over the registry: switch to another (the switch splash shows, then its
 * landing page), New workspace… (the Create workspace dialog), Open folder… (add a workspace folder,
 * then open it), and Show in Finder for the open one. A failure shows as a toast.
 */
function WorkspaceMenu() {
  const { ipc, trpc } = useServices();
  const current = useQuery(trpc.workspaces.current.queryOptions());
  const list = useQuery(trpc.workspaces.list.queryOptions());
  const [creating, setCreating] = useState(false);

  const fail = (error: unknown) => {
    const { title, description } = describeWorkspaceError(ipcFailureOf(error));
    toast({ tone: 'error', title, description });
  };
  const open = (id: WorkspaceId) => {
    ipc.workspaces.open.mutate({ id }).catch(fail);
  };
  const openFolder = () => {
    ipc.workspaces.importFolder
      .mutate()
      .then((added) => added && ipc.workspaces.open.mutate({ id: added.id }))
      .catch(fail);
  };

  const workspaces = list.data?.items ?? [];
  return (
    <>
      <SidebarWorkspace
        name={current.data?.name ?? 'No workspace open'}
        color={swatchOf(current.data?.color)}
      >
        <WorkspaceSwitcher
          workspaces={workspaces.map(({ id, name, color }) => ({
            id,
            name,
            color: swatchOf(color),
          }))}
          current={current.data?.id ?? ''}
          onSelect={(id) => open(id as WorkspaceId)}
          onCreate={() => setCreating(true)}
          onOpenFolder={openFolder}
          onShowInFinder={() => {
            ipc.workspace.showInFolder.mutate().catch(fail);
          }}
        />
      </SidebarWorkspace>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
