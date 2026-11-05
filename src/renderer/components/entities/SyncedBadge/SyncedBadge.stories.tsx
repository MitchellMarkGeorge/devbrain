import type { Meta, StoryObj } from '@storybook/react-vite';
import { SyncedBadge } from './SyncedBadge';

const meta = {
  title: 'Entities/SyncedBadge',
  component: SyncedBadge,
  args: { children: 'Linear · ENG-124' },
  argTypes: { state: { control: 'inline-radio', options: ['synced', 'detached'] } },
} satisfies Meta<typeof SyncedBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Under a synced item's title */
export const Synced: Story = {};

/** A local copy that remembers where it came from */
export const Detached: Story = {
  args: { state: 'detached', children: 'Detached from Linear · ENG-124' },
};

export const GitHub: Story = { args: { provider: 'github', children: 'GitHub · devbrain#482' } };
