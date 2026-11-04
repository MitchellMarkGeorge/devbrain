import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccountStatus } from './AccountStatus';

const meta = {
  title: 'Integrations/AccountStatus',
  component: AccountStatus,
  args: { state: 'connected' },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['connected', 'needs-reconnect', 'off', 'coming-later'],
    },
  },
} satisfies Meta<typeof AccountStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <AccountStatus state="connected" />
      <AccountStatus state="needs-reconnect" />
      <AccountStatus state="off" />
      <AccountStatus state="coming-later" />
    </div>
  ),
};
