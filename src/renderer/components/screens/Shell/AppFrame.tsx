/**
 * The shared frame for screen stories: DevBrain's sidebar filled with the Figma file's sample
 * workspace, and `ScreenFrame`, which sizes an `AppShell` to a Figma screen. Screen stories in
 * every area import these; nothing in the app does.
 */
import type { ReactNode } from 'react';
import { TaskStatus } from '@common/types';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  Ellipsis,
  FileText,
  Folder,
  House,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Zap,
} from 'lucide-react';
import { AppShell, type AppShellProps } from '../../shell/AppShell';
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
} from '../../shell/Sidebar';
import { StatusIcon } from '../../entities/StatusIcon';
import { SyncStatus, type SyncState } from '../../shell/SyncStatus';
import { WorkspaceSwitcher, type WorkspaceSummary } from '../../shell/WorkspaceSwitcher';

export type PageName =
  | 'Home'
  | 'Tasks'
  | 'Projects'
  | 'Notes'
  | 'Calendar'
  | 'Integrations'
  | 'Trash'
  | 'Settings'
  | 'Help';

const NAV: { label: PageName; icon: typeof House }[] = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
];

export const WORKSPACES: WorkspaceSummary[] = [
  { id: 'surveymonkey', name: 'SurveyMonkey', color: 'green' },
  { id: 'personal', name: 'Personal', color: 'blue' },
  { id: 'side-projects', name: 'Side projects', color: 'indigo' },
];

export interface DemoSidebarProps {
  /** the current page */
  active?: PageName;
  /** a first-run workspace: no Recents or Favorites yet */
  empty?: boolean;
  /** the sync line at the top of the footer */
  sync?: SyncState;
  /** open the workspace menu (the switcher screen) */
  workspaceMenuOpen?: boolean;
}

/** The sidebar as every Figma screen draws it: SurveyMonkey, the six pages, Recents, Favorites. */
export function DemoSidebar({ active, empty, sync, workspaceMenuOpen }: DemoSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarWorkspace name="SurveyMonkey" color="green" defaultOpen={workspaceMenuOpen}>
          <WorkspaceSwitcher workspaces={WORKSPACES} current="surveymonkey" />
        </SidebarWorkspace>
        <SidebarHeaderActions>
          <SidebarAction icon={Search} label="Search" shortcut="⌘K" />
          <SidebarAction icon={SquarePen} label="New task" shortcut="C" />
        </SidebarHeaderActions>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {NAV.map((page) => (
            <SidebarItem key={page.label} icon={page.icon} active={active === page.label}>
              {page.label}
            </SidebarItem>
          ))}
        </SidebarGroup>
        {!empty && (
          <>
            <SidebarGroup label="Recents">
              <SidebarItem icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}>
                Implement OAuth2 PKCE flow
              </SidebarItem>
              <SidebarItem icon={<StatusIcon status={TaskStatus.IN_PROGRESS} />}>
                Refactor token refresh logic
              </SidebarItem>
              <SidebarItem bar="green">Mitchell / Jesse 1:1</SidebarItem>
              <SidebarItem icon={Folder}>Auth Overhaul</SidebarItem>
              <SidebarItem icon={FileText}>PKCE design notes</SidebarItem>
            </SidebarGroup>
            <SidebarGroup label="Favorites">
              <SidebarItem icon={Folder}>API Gateway v2</SidebarItem>
              <SidebarItem bar="green">Sprint Planning</SidebarItem>
              <SidebarItem icon={FileText}>Auth provider eval matrix</SidebarItem>
              <SidebarItem icon={Ellipsis}>More</SidebarItem>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        {sync && (
          <SyncStatus state={sync} lastSynced="2 min ago" retryAt="9:15 AM" onRetry={() => {}} />
        )}
        <SidebarItem icon={Trash2} active={active === 'Trash'}>
          Trash
        </SidebarItem>
        <SidebarItem icon={Settings} active={active === 'Settings'}>
          Settings
        </SidebarItem>
        <SidebarItem icon={CircleHelp}>Help</SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

export interface ScreenFrameProps extends Omit<AppShellProps, 'sidebar'> {
  /** the Figma frame's size: 1440×1024 by default, 960×640 for the compact frames */
  width?: number;
  height?: number;
  sidebar?: ReactNode;
  /** props for the default `DemoSidebar` */
  page?: PageName;
  emptySidebar?: boolean;
  sync?: SyncState;
  workspaceMenuOpen?: boolean;
}

/**
 * An `AppShell` the size of a Figma screen, with the traffic lights drawn and the demo sidebar.
 * The shell measures itself, so a 960px frame behaves as a compact window.
 */
export function ScreenFrame({
  width = 1440,
  height = 1024,
  sidebar,
  page,
  emptySidebar,
  sync,
  workspaceMenuOpen,
  style,
  ...props
}: ScreenFrameProps) {
  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <AppShell
        sidebar={
          sidebar ?? (
            <DemoSidebar
              active={page}
              empty={emptySidebar}
              sync={sync}
              workspaceMenuOpen={workspaceMenuOpen}
            />
          )
        }
        style={style}
        {...props}
      />
    </div>
  );
}
