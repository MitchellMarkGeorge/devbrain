/**
 * The app frame the list screens' stories share: the sidebar as it is, then a plain page header
 * (breadcrumb row and toolbar) drawn inline. Agent E1 builds the real page header and toolbar;
 * once they exist these stories should use them instead.
 */
import type { CSSProperties, ReactNode } from 'react';
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
import { Breadcrumb, type BreadcrumbItem } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
  SidebarWorkspace,
} from '../../shell/Sidebar';
import { StatusIcon } from '../../entities/StatusIcon';
import { TooltipProvider } from '../../ui/Tooltip';

export type Page = 'Home' | 'Tasks' | 'Projects' | 'Notes' | 'Calendar' | 'Integrations' | 'Trash';

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
] as const;

function AppSidebar({ active }: { active: Page }) {
  return (
    <Sidebar
      header={
        <SidebarHeader>
          <SidebarWorkspace name="SurveyMonkey" color="green" />
          <SidebarHeaderActions>
            <Button variant="ghost" size="icon-xs" icon={Search} aria-label="Search" />
            <Button variant="ghost" size="icon-xs" icon={SquarePen} aria-label="New task" />
          </SidebarHeaderActions>
        </SidebarHeader>
      }
    >
      <SidebarContent>
        <SidebarGroup>
          {NAV.map((n) => (
            <SidebarItem key={n.label} icon={n.icon} active={active === n.label}>
              {n.label}
            </SidebarItem>
          ))}
        </SidebarGroup>
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarItem icon={Trash2} active={active === 'Trash'}>
          Trash
        </SidebarItem>
        <SidebarItem icon={Settings}>Settings</SidebarItem>
        <SidebarItem icon={CircleHelp}>Help</SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

const frame: CSSProperties = {
  display: 'flex',
  height: 1024,
  background: 'var(--background)',
  color: 'var(--foreground)',
  overflow: 'hidden',
};
const main: CSSProperties = {
  position: 'relative',
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};
// the header: a 48px breadcrumb row, then the 46px toolbar (a 34px row and 12px below it)
const crumbs: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 48,
  padding: '0 24px',
};
const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 34,
  margin: '0 24px 12px',
};
const body: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '0 16px 16px',
};

export interface AppFrameProps {
  active: Page;
  breadcrumb: (BreadcrumbItem | string)[];
  /** the toolbar's left side (Filter, Group by, a type filter) */
  toolbarStart?: ReactNode;
  /** the toolbar's right side (Sort, the view toggle, New …) */
  toolbarEnd?: ReactNode;
  children: ReactNode;
  /** the page's body padding, when a screen differs (the board's 24px) */
  bodyStyle?: CSSProperties;
}

/** A 1440 × 1024 window: sidebar, page header and the scrolling page body. */
export function AppFrame({
  active,
  breadcrumb,
  toolbarStart,
  toolbarEnd,
  children,
  bodyStyle,
}: AppFrameProps) {
  return (
    <TooltipProvider>
      <div style={frame}>
        <AppSidebar active={active} />
        <main style={main}>
          <div style={crumbs}>
            <Breadcrumb items={breadcrumb} />
          </div>
          <div style={toolbar}>
            {toolbarStart}
            <span style={{ flex: 1 }} />
            {toolbarEnd}
          </div>
          <div style={{ ...body, ...bodyStyle }}>{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
