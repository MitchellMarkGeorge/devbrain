import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import type { SyncState } from '../SyncStatus';
import { TooltipProvider } from '../../ui/Tooltip';
import { Sidebar, SidebarContent, SidebarGroup, SidebarHint, SidebarItem } from './Sidebar';

const meta = {
  title: 'Shell/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        {/* the canvas's height, so the footer stays in view and the middle scrolls when short */}
        <div style={{ height: '100vh', display: 'flex' }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The sidebar as Figma's `Sidebar` symbol: header, the six pages, Recents and Favorites, Trash,
 * Settings and Help. Inside a `WorkspaceShell` it sits under the shell's title bar (traffic lights,
 * toggle, back, forward), and the shell docks it or hides it; see Shell/WorkspaceShell.
 */
export const Default: Story = { render: () => <DemoSidebar active="Home" /> };

/**
 * The sync line at the top of the footer: synced, syncing, failed (with Retry), rate limited,
 * offline. Pick one with the `sync` control.
 */
export const WithSyncStatus: StoryObj<{ sync: SyncState }> = {
  args: { sync: 'error' },
  argTypes: {
    sync: {
      control: 'inline-radio',
      options: ['synced', 'syncing', 'error', 'rate-limited', 'offline'],
    },
  },
  render: ({ sync }) => <DemoSidebar active="Tasks" sync={sync} />,
};

/** Recents and Favorites fold away from their labels: point at a label for its chevron, click to fold. */
export const CollapsibleGroups: Story = {
  render: function Groups() {
    const [open, setOpen] = useState(true);
    return (
      <Sidebar>
        <SidebarContent>
          <SidebarGroup label="Recents" open={open} onOpenChange={setOpen}>
            <SidebarItem icon={Folder} iconColor="blue">
              Auth Overhaul
            </SidebarItem>
            <SidebarItem bar="green">Mitchell / Jesse 1:1</SidebarItem>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  },
};

/** An empty group keeps its label and says what it would hold: Favorites before anything is starred. */
export const EmptyGroupHint: Story = {
  render: () => (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup label="Favorites">
          <SidebarHint>Star a task, note or project to keep it here.</SidebarHint>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  ),
};
