import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProviderLogo } from '..';

const meta = {
  title: 'Content/ProviderLogo',
  component: ProviderLogo,
  tags: ['autodocs'],
  args: { provider: 'linear', size: 24 },
} satisfies Meta<typeof ProviderLogo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const GitHub: Story = { args: { provider: 'github' } };
