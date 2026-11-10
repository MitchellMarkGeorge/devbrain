/*
 * The window around the detail-page screen stories (task, note, editor, create dialogs): the
 * sidebar as the Figma screens show it, and an inline top bar (breadcrumb, star, "…"). The real
 * top bar is PageHeader (agent E1); these stories draw their own so they don't depend on it.
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
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import { Breadcrumb, type BreadcrumbItem } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
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

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
];

export function AppSidebar({ active }: { active: string }) {
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
        <SidebarItem icon={Trash2}>Trash</SidebarItem>
        <SidebarItem icon={Settings}>Settings</SidebarItem>
        <SidebarItem icon={CircleHelp}>Help</SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

/** The detail page's top bar: the breadcrumb, then the star and "…" on the right. */
export function DetailTopBar({
  items,
  actions = true,
}: {
  items: (BreadcrumbItem | string)[];
  actions?: boolean;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        height: 48,
        padding: '0 16px 0 24px',
      }}
    >
      <Breadcrumb items={items} style={{ flex: 1, minWidth: 0 }} />
      {actions && (
        <>
          <IconButton size="sm" tone="muted" icon={Star} label="Favorite" />
          <IconButton size="sm" tone="muted" icon={Ellipsis} label="More actions" />
        </>
      )}
    </header>
  );
}

/** A 1440 × 1024 window: the sidebar, then the page. */
export function AppWindow({
  active,
  children,
  width = 1440,
  height = 1024,
}: {
  active: string;
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <TooltipProvider>
      <div
        style={{
          display: 'flex',
          width,
          height,
          overflow: 'hidden',
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <AppSidebar active={active} />
        <main style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
