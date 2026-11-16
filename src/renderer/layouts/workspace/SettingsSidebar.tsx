import { Link, useMatchRoute, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  Calendar,
  CircleCheck,
  Database,
  FolderInput,
  PanelTop,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarItem } from '@renderer/components';
import type { FileRouteTypes } from '@renderer/routeTree.gen';

type SectionPath = Extract<FileRouteTypes['to'], `/app/$workspaceId/settings/${string}`>;

interface Section {
  to: SectionPath;
  label: string;
  icon: LucideIcon;
}

// what belongs to the open workspace (its own database and accounts)
const CURRENT_WORKSPACE: Section[] = [
  { to: '/app/$workspaceId/settings/general', label: 'General', icon: PanelTop },
  { to: '/app/$workspaceId/settings/integrations', label: 'Integrations', icon: Zap },
  { to: '/app/$workspaceId/settings/import-export', label: 'Import & export', icon: FolderInput },
];

// what the DevBrain folder's settings file keeps, for every workspace in it
const ALL_WORKSPACES: Section[] = [
  { to: '/app/$workspaceId/settings/preferences', label: 'Preferences', icon: SlidersHorizontal },
  { to: '/app/$workspaceId/settings/tasks', label: 'Tasks', icon: CircleCheck },
  { to: '/app/$workspaceId/settings/calendar', label: 'Calendar', icon: Calendar },
  { to: '/app/$workspaceId/settings/data-storage', label: 'Data & storage', icon: Database },
];

/**
 * The sidebar while the settings are open, in place of the app's: Back to app, then the sections
 * the open workspace owns (Current workspace) apart from those every workspace shares (All
 * workspaces), each a page. `onBack` goes to the page the settings were opened from.
 */
export function SettingsSidebar({ onBack }: { onBack: () => void }) {
  const { workspaceId } = useParams({ from: '/app/$workspaceId' });
  const matchRoute = useMatchRoute();
  const item = (section: Section) => (
    <SidebarItem
      key={section.to}
      icon={section.icon}
      active={Boolean(matchRoute({ to: section.to, params: { workspaceId } }))}
      render={<Link to={section.to} params={{ workspaceId }} />}
    >
      {section.label}
    </SidebarItem>
  );
  return (
    <Sidebar
      aria-label="Settings"
      header={
        <SidebarItem icon={ArrowLeft} onClick={onBack}>
          Back to app
        </SidebarItem>
      }
    >
      <SidebarContent>
        <SidebarGroup label="Current workspace" collapsible={false}>
          {CURRENT_WORKSPACE.map(item)}
        </SidebarGroup>
        <SidebarGroup label="All workspaces" collapsible={false}>
          {ALL_WORKSPACES.map(item)}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
