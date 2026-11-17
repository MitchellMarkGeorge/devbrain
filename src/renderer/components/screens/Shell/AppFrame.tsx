/**
 * The shared frame for screen stories: DevBrain's sidebar filled with the Figma file's sample
 * workspace, and `ScreenFrame`, which sizes a `WorkspaceShell` to a Figma screen. Screen stories in
 * every area import these; nothing in the app does.
 */
import type { ReactNode } from 'react';
import { WorkspaceButton } from '../../shell/WorkspaceSwitcher';
import { TaskStatus } from '@common/types';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  Ellipsis,
  FileText,
  Folder,
  House,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import { WorkspaceShell, type WorkspaceShellProps } from '../../shell/WorkspaceShell';
import { Page } from '../../shell/Page';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarItem,
} from '../../shell/Sidebar';
import { StatusIcon } from '../../entities/StatusIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
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
}

/** The sidebar as every Figma screen draws it: the six pages, Recents, Favorites. */
export function DemoSidebar({ active, empty, sync }: DemoSidebarProps) {
  return (
    <Sidebar>
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

/** The New menu as the app draws it, for screen stories: "+" opening the four things to create. */
export function DemoCreateMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton size="sm" tone="muted" icon={Plus} label="New" />} />
      <DropdownMenuContent align="start">
        <DropdownMenuItem icon={CircleCheck} shortcut="C">
          New task
        </DropdownMenuItem>
        <DropdownMenuItem icon={FileText} shortcut="N">
          New note
        </DropdownMenuItem>
        <DropdownMenuItem icon={Folder}>New project</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Calendar}>New event</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The title bar's workspace and New as the app fills them, for a `WorkspaceShell` in a story: the
 * sample workspace (its menu open with `workspaceMenuOpen`), and `DemoCreateMenu`.
 */
export function demoTitleBar(workspaceMenuOpen?: boolean) {
  return {
    workspace: (
      <WorkspaceButton name="SurveyMonkey" color="green" defaultOpen={workspaceMenuOpen}>
        <WorkspaceSwitcher workspaces={WORKSPACES} current="surveymonkey" />
      </WorkspaceButton>
    ),
    create: <DemoCreateMenu />,
    onSearch: () => {},
  };
}

export interface ScreenFrameProps extends Omit<WorkspaceShellProps, 'sidebar' | 'title'> {
  /** the Figma frame's size: 1440×1024 by default, 960×640 for the compact frames */
  width?: number;
  height?: number;
  sidebar?: ReactNode;
  /** the page's title, in the title bar's search field */
  title?: string;
  /** the page's actions, at the title bar's end; the children are drawn in its `Page` */
  actions?: ReactNode;
  /** open the workspace menu (the switcher screen) */
  workspaceMenuOpen?: boolean;
  /** props for the default `DemoSidebar` */
  page?: PageName;
  emptySidebar?: boolean;
  sync?: SyncState;
}

/**
 * An `WorkspaceShell` the size of a Figma screen, with the traffic lights drawn and the demo sidebar.
 * The shell measures itself, so a 960px frame behaves as a compact window.
 */
export function ScreenFrame({
  width = 1440,
  height = 1024,
  sidebar,
  title,
  actions,
  page,
  emptySidebar,
  sync,
  workspaceMenuOpen,
  style,
  children,
  ...props
}: ScreenFrameProps) {
  return (
    <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
      <WorkspaceShell
        sidebar={sidebar ?? <DemoSidebar active={page} empty={emptySidebar} sync={sync} />}
        style={style}
        {...demoTitleBar(workspaceMenuOpen)}
        {...props}
      >
        <Page title={title} actions={actions}>
          {children}
        </Page>
      </WorkspaceShell>
    </div>
  );
}
