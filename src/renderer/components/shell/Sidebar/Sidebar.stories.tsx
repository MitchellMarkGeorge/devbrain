import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleHelp, Folder, Settings, Trash2 } from 'lucide-react';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import { SyncStatus, type SyncState } from '../SyncStatus';
import { TooltipProvider } from '../../ui/Tooltip';
import {
  Sidebar,
  SidebarAction,
  SidebarContent,
  SidebarFooter,
  SidebarFooterActions,
  SidebarGroup,
  SidebarHint,
  SidebarItem,
} from './Sidebar';

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
 * The sidebar as Figma's `Sidebar` symbol: the pages, Recents and Favorites, then the footer's row
 * with Trash, Settings and Help as icons. Inside a `WorkspaceShell` it sits under the shell's title bar (traffic lights,
 * toggle, back, forward), and the shell docks it or hides it; see Shell/WorkspaceShell.
 */
export const Default: Story = { render: () => <DemoSidebar active="Home" /> };

/**
 * The sync line at the start of the footer's row: synced, syncing, failed (with Retry), rate
 * limited, offline. Pick one with the `sync` control.
 */
export const WithSyncStatus: StoryObj<{ sync: SyncState }> = {
  args: { sync: 'error' },
  argTypes: {
    sync: {
      control: 'inline-radio',
      options: ['synced', 'syncing', 'error', 'rate-limited', 'offline', 'none'],
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

/**
 * The footer's row in every sync state, the last with no source connected ("Not syncing", quieter).
 * The line shortens before the actions do; Settings is the current page in the last.
 */
export const FooterStates: Story = {
  render: () => {
    const states: SyncState[] = ['synced', 'syncing', 'error', 'rate-limited', 'offline', 'none'];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 256, padding: 12 }}>
        {states.map((state) => (
          <SidebarFooter key={state}>
            <SyncStatus
              state={state}
              lastSynced="12 min ago"
              retryAt="9:15 AM"
              onRetry={() => {}}
            />
            <SidebarFooterActions>
              <SidebarAction icon={Trash2} label="Trash" tooltipSide="top" />
              <SidebarAction
                icon={Settings}
                label="Settings"
                tooltipSide="top"
                active={state === 'none'}
              />
              <SidebarAction icon={CircleHelp} label="Help" shortcut="?" tooltipSide="top" />
            </SidebarFooterActions>
          </SidebarFooter>
        ))}
      </div>
    );
  },
};
