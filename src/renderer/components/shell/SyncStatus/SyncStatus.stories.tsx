import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../../layout/Flex';
import { TooltipProvider } from '../../ui/Tooltip';
import { SyncStatus } from './SyncStatus';

const meta = {
  title: 'Shell/SyncStatus',
  component: SyncStatus,
  args: { state: 'synced', lastSynced: '2 min ago' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        {/* the room the footer's row leaves it, beside Trash, Settings and Help */}
        <div style={{ width: 152 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SyncStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Synced: Story = {};

/** The seven states, in their short form; paused, offline, sync off and set up sync say the rest in a tooltip. */
export const States: Story = {
  render: () => (
    <Stack gap="3">
      <SyncStatus state="synced" lastSynced="2 min ago" />
      <SyncStatus state="synced" lastSynced="yesterday at 4:12 PM" />
      <SyncStatus state="syncing" />
      <SyncStatus state="error" onRetry={() => {}} />
      <SyncStatus state="rate-limited" retryAt="9:15 AM" />
      <SyncStatus state="offline" />
      <SyncStatus state="off" />
      <SyncStatus state="none" />
    </Stack>
  ),
};
