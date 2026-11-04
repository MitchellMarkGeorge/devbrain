import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  Ellipsis,
  FileText,
  Folder,
  House,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SquarePen,
  Zap,
} from 'lucide-react';
import { Button } from '../Button';
import { DropdownMenuItem, DropdownMenuSeparator } from '../DropdownMenu';
import { StatusIcon } from '../StatusIcon';
import { TooltipProvider } from '../Tooltip';
import { WorkspaceTile } from '../WorkspaceTile';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
  SidebarWorkspace,
} from './Sidebar';

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
];

function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [active, setActive] = useState('Tasks');
  return (
    <TooltipProvider>
      <div style={{ height: 720, display: 'flex' }}>
        <Sidebar collapsed={collapsed}>
          <SidebarHeader>
            <SidebarWorkspace name="SurveyMonkey" color="green">
              <DropdownMenuItem icon={<WorkspaceTile letter="S" color="green" />}>
                SurveyMonkey
              </DropdownMenuItem>
              <DropdownMenuItem icon={<WorkspaceTile letter="P" color="indigo" />}>
                Personal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Plus}>New workspace</DropdownMenuItem>
            </SidebarWorkspace>
            {!collapsed && (
              <SidebarHeaderActions>
                <Button variant="ghost" size="icon-xs" icon={Search} aria-label="Search" />
                <Button size="icon-xs" icon={SquarePen} aria-label="New task" />
              </SidebarHeaderActions>
            )}
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              {NAV.map((n) => (
                <SidebarItem
                  key={n.label}
                  icon={n.icon}
                  active={active === n.label}
                  onClick={() => setActive(n.label)}
                >
                  {n.label}
                </SidebarItem>
              ))}
            </SidebarGroup>
            <SidebarGroup label="Recents" collapsible>
              <SidebarItem icon={Folder} iconColor="blue">
                DevBrain 1.0
              </SidebarItem>
              <SidebarItem icon={<StatusIcon status="in-progress" />}>
                Ship the onboarding flow
              </SidebarItem>
              <SidebarItem icon={FileText}>Q4 planning notes</SidebarItem>
              <SidebarItem bar="indigo">Mitchell / Jesse 1:1</SidebarItem>
              <SidebarItem icon={Ellipsis}>More</SidebarItem>
            </SidebarGroup>
            <SidebarGroup label="Favorites" collapsible>
              <SidebarItem icon={Folder} iconColor="amber">
                Planning
              </SidebarItem>
              <SidebarItem icon={Folder} iconColor="green">
                Calendar sync
              </SidebarItem>
              <SidebarItem icon={FileText}>Sync engine design</SidebarItem>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarItem icon={Settings}>Settings</SidebarItem>
            <SidebarItem icon={CircleHelp}>Help</SidebarItem>
          </SidebarFooter>
        </Sidebar>
        <div style={{ flex: 1, padding: 16, borderLeft: '1px solid var(--border)' }}>
          <Button variant="ghost" size="icon-sm" icon={PanelLeft} aria-label="Toggle sidebar" />
        </div>
      </div>
    </TooltipProvider>
  );
}

const meta = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Expanded: Story = { render: () => <AppSidebar /> };

/** The 56px icon rail: the workspace tile, then one icon button per page with a tooltip */
export const Collapsed: Story = { render: () => <AppSidebar collapsed /> };

/** The user collapses and expands it with the page's toggle */
export const Toggle: Story = {
  render: function ToggleStory() {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <div style={{ display: 'flex', height: 720 }}>
        <div style={{ padding: 8 }}>
          <Button
            variant="ghost"
            size="icon-sm"
            icon={PanelLeft}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
          />
        </div>
        <AppSidebar collapsed={collapsed} />
      </div>
    );
  },
};
