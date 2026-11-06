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
import { Button } from '../../ui/Button';
import { StatusIcon } from '../../entities/StatusIcon';
import { TooltipProvider } from '../../ui/Tooltip';
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

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
] as const;

export type Page = (typeof NAV)[number]['label'] | 'Settings';

/**
 * The window the screen stories sit in: the app's sidebar (Figma's Recents and Favorites) and the
 * page beside it. Story-only: the real page frame and header belong to the app shell.
 */
export function AppFrame({
  page,
  children,
  width = 1440,
  height = 1024,
}: {
  page: Page;
  children: ReactNode;
  width?: number | string;
  height?: number | string;
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
        }}
      >
        <Sidebar>
          <SidebarHeader>
            <SidebarWorkspace name="SurveyMonkey" color="green" />
            <SidebarHeaderActions>
              <Button variant="ghost" size="icon-xs" icon={Search} aria-label="Search" />
              <Button variant="ghost" size="icon-xs" icon={SquarePen} aria-label="New task" />
            </SidebarHeaderActions>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              {NAV.map((n) => (
                <SidebarItem key={n.label} icon={n.icon} active={page === n.label}>
                  {n.label}
                </SidebarItem>
              ))}
            </SidebarGroup>
            <SidebarGroup label="Recents" collapsible>
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
            <SidebarGroup label="Favorites" collapsible>
              <SidebarItem icon={Folder}>API Gateway v2</SidebarItem>
              <SidebarItem bar="green">Sprint Planning</SidebarItem>
              <SidebarItem icon={FileText}>Auth provider eval matrix</SidebarItem>
              <SidebarItem icon={Ellipsis}>More</SidebarItem>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarItem icon={Trash2}>Trash</SidebarItem>
            <SidebarItem icon={Settings} active={page === 'Settings'}>
              Settings
            </SidebarItem>
            <SidebarItem icon={CircleHelp}>Help</SidebarItem>
          </SidebarFooter>
        </Sidebar>
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--border)',
          }}
        >
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}

/**
 * The page header as the screens draw it (56px: the title, then the page's controls on the
 * right; put a `<Spacer />` between). Inlined here until the app's page header component exists.
 */
export function PageHeader({
  title,
  children,
  style,
}: {
  title: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 56,
        flex: 'none',
        padding: '0 24px',
        borderBottom: '1px solid var(--border)',
        ...style,
      }}
    >
      <h1
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--foreground-strong)',
          font: 'var(--font-weight-semibold) var(--text-2xl) / var(--text-2xl-leading) var(--font-sans)',
          letterSpacing: 'var(--tracking-tight)',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>
      {children}
    </header>
  );
}

/** Pushes the header's following controls to the right. */
export function Spacer() {
  return <div style={{ flex: 1 }} />;
}
