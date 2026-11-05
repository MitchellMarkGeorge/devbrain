import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { ProviderLogo } from './ProviderLogo';

const meta = {
  title: 'Entities/ProviderLogo',
  component: ProviderLogo,
  args: { provider: 'linear', size: 12 },
  argTypes: {
    provider: { control: 'inline-radio', options: ['linear', 'github'] },
    size: { control: 'inline-radio', options: [12, 16, 24, 32] },
  },
} satisfies Meta<typeof ProviderLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Providers: Story = {
  render: () => (
    <Flex gap="4" align="center">
      {[12, 16, 32].map((size) => (
        <Flex key={size} gap="2" align="center">
          <ProviderLogo provider="linear" size={size} />
          <ProviderLogo provider="github" size={size} />
        </Flex>
      ))}
    </Flex>
  ),
};
