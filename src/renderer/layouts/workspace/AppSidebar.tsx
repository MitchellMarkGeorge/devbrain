import { Link, useMatchRoute, useParams } from '@tanstack/react-router';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  FileText,
  Folder,
  House,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarFooterActions,
  SidebarGroup,
  SidebarItem,
} from '@renderer/components';
import { useRunCommand } from '@renderer/keyboard';
import type { FileRouteTypes } from '@renderer/routeTree.gen';
import { SidebarFavorites, SidebarRecents, SidebarSync } from './SidebarEntities';

type PagePath = Extract<FileRouteTypes['to'], `/app/$workspaceId/${string}`>;

interface NavPage {
  to: PagePath;
  label: string;
  icon: LucideIcon;
}

const NAV: NavPage[] = [
  { to: '/app/$workspaceId/home', label: 'Home', icon: House },
  { to: '/app/$workspaceId/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/app/$workspaceId/projects', label: 'Projects', icon: Folder },
  { to: '/app/$workspaceId/notes', label: 'Notes', icon: FileText },
  { to: '/app/$workspaceId/calendar', label: 'Calendar', icon: Calendar },
];

const FOOTER: NavPage[] = [
  { to: '/app/$workspaceId/trash', label: 'Trash', icon: Trash2 },
  { to: '/app/$workspaceId/settings', label: 'Settings', icon: Settings },
];

/**
 * The app's sidebar: the pages as links (a page's details keep it active; Integrations is a
 * section of the settings), Recents and Favorites, then the footer's row: the sync line, and Trash,
 * Settings and Help as icons (Help opens the keyboard shortcuts, as `?` does). The workspace menu,
 * search and New are in the title bar (`AppLayout` gives them to the shell).
 */
export interface AppSidebarProps {
  /** a page's search as it was last shown (the root layout keeps them), by its path */
  searchOf: (pathname: string) => Record<string, unknown> | undefined;
}

export function AppSidebar({ searchOf }: AppSidebarProps) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const matchRoute = useMatchRoute();
  const run = useRunCommand();
  const isActive = (page: NavPage) =>
    Boolean(matchRoute({ to: page.to, params: { workspaceId }, fuzzy: true }));
  // a section's link goes back to it as it was left: its view and filters (and the router puts it
  // back where it was scrolled). Read as the
  // link is followed, not as it's drawn, so it's never a step behind the page shown
  const link = (page: NavPage) => (
    <Link
      to={page.to}
      params={{ workspaceId }}
      search={() => searchOf(page.to.replace('$workspaceId', workspaceId)) ?? {}}
    />
  );
  const item = (page: NavPage) => (
    <SidebarItem key={page.to} icon={page.icon} active={isActive(page)} render={link(page)}>
      {page.label}
    </SidebarItem>
  );
  const action = (page: NavPage) => (
    <SidebarAction
      key={page.to}
      icon={page.icon}
      label={page.label}
      tooltipSide="top"
      active={isActive(page)}
      render={link(page)}
    />
  );
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>{NAV.map(item)}</SidebarGroup>
        <SidebarRecents />
        <SidebarFavorites />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSync />
        <SidebarFooterActions>
          {FOOTER.map(action)}
          <SidebarAction
            icon={CircleHelp}
            label="Help"
            shortcut="?"
            tooltipSide="top"
            onClick={() => run('help.shortcuts')}
          />
        </SidebarFooterActions>
      </SidebarFooter>
    </Sidebar>
  );
}
