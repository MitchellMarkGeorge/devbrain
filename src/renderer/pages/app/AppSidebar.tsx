import { Link, useMatchRoute, useParams } from '@tanstack/react-router';
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
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarAction,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
} from '../../components';
import { useCreateNote } from '../notes/use-create-note';
import { useOpenSearch } from '../search/use-open-search';
import type { FileRouteTypes } from '../../routeTree.gen';
import { WorkspaceMenu } from './WorkspaceMenu';
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
  { to: '/app/$workspaceId/integrations', label: 'Integrations', icon: Zap },
];

const FOOTER: NavPage[] = [
  { to: '/app/$workspaceId/trash', label: 'Trash', icon: Trash2 },
  { to: '/app/$workspaceId/settings', label: 'Settings', icon: Settings },
];

/**
 * The app's sidebar: the workspace menu and its compose button (New note, as N), the pages as links (a page's details keep it active),
 * Recents and Favorites, then the sync line, Trash, Settings and Help, drawn disabled until there
 * is help.
 */
export function AppSidebar() {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const matchRoute = useMatchRoute();
  const createNote = useCreateNote();
  const openSearch = useOpenSearch();
  const item = (page: NavPage) => (
    <SidebarItem
      key={page.to}
      icon={page.icon}
      active={Boolean(matchRoute({ to: page.to, params: { workspaceId }, fuzzy: true }))}
      render={<Link to={page.to} params={{ workspaceId }} />}
    >
      {page.label}
    </SidebarItem>
  );
  return (
    <Sidebar
      header={
        <SidebarHeader>
          <WorkspaceMenu />
          <SidebarHeaderActions>
            <SidebarAction icon={Search} label="Search" shortcut="⌘K" onClick={openSearch} />
            <SidebarAction
              icon={SquarePen}
              label="New note"
              shortcut="N"
              onClick={() => void createNote()}
            />
          </SidebarHeaderActions>
        </SidebarHeader>
      }
    >
      <SidebarContent>
        <SidebarGroup>{NAV.map(item)}</SidebarGroup>
        <SidebarRecents />
        <SidebarFavorites />
      </SidebarContent>
      <SidebarFooter>
        <SidebarSync />
        {FOOTER.map(item)}
        <SidebarItem icon={CircleHelp} disabled>
          Help
        </SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}
