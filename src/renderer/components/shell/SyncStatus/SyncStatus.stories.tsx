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
        <div style={{ width: 224 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof SyncStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Synced: Story = {};

/** The five states of Figma's `SyncStatus`. */
export const States: Story = {
  render: () => (
    <Stack gap="3">
      <SyncStatus state="synced" lastSynced="2 min ago" />
      <SyncStatus state="syncing" />
      <SyncStatus state="error" onRetry={() => {}} />
      <SyncStatus state="rate-limited" retryAt="9:15 AM" />
      <SyncStatus state="offline" />
    </Stack>
  ),
};
