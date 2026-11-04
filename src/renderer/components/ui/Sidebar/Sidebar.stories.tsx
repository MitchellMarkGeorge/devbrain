import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Folder } from 'lucide-react';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import { TooltipProvider } from '../Tooltip';
import { Sidebar, SidebarContent, SidebarGroup, SidebarItem } from './Sidebar';

const meta = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ height: 1024, display: 'flex' }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The full sidebar as Figma's `Sidebar` symbol: header, the six pages, Recents and Favorites,
 * Trash, Settings and Help. Inside an `AppShell` it also draws the window row (traffic lights,
 * toggle, back, forward) at the top; see Screens/Shell.
 */
export const Expanded: Story = { render: () => <DemoSidebar active="Home" /> };

/**
 * Figma's `SidebarRail`: 56px, the tile, search and new, the pages, then Recents (clock) and
 * Favorites (star), which open popovers listing their items. Each item names itself (and its
 * go-to keys) in a tooltip at its right.
 */
export const Rail: Story = {
  render: () => <DemoSidebar active="Tasks" collapsed sync="synced" />,
};

/** The sync line at the top of the footer: synced, syncing, failed (with Retry), paused, offline. */
export const WithSyncStatus: Story = {
  render: () => <DemoSidebar active="Tasks" sync="error" />,
};

/** Recents and Favorites fold away from their labels. */
export const CollapsibleGroups: Story = {
  render: function Groups() {
    const [open, setOpen] = useState(true);
    return (
      <Sidebar>
        <SidebarContent>
          <SidebarGroup label="Recents" collapsible open={open} onOpenChange={setOpen}>
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
