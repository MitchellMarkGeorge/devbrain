import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProviderTile } from './ProviderTile';

const meta = {
  title: 'Integrations/ProviderTile',
  component: ProviderTile,
  args: { provider: 'linear' },
  argTypes: {
    provider: { control: 'inline-radio', options: ['linear', 'google-calendar', 'github'] },
  },
} satisfies Meta<typeof ProviderTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Linear, Google Calendar and GitHub at 32px */
export const All: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16 }}>
      <ProviderTile provider="linear" />
      <ProviderTile provider="google-calendar" />
      <ProviderTile provider="github" />
    </div>
  ),
};
