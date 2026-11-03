import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, HealthIcon } from '..';

const meta = {
  title: 'Content/HealthIcon',
  component: HealthIcon,
  tags: ['autodocs'],
  args: { health: 'on-track' },
} satisfies Meta<typeof HealthIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllHealthStates: Story = {
  render: () => (
    <Flex gap={4}>
      {(['on-track', 'at-risk', 'off-track', 'not-started', 'completed'] as const).map((health) => (
        <HealthIcon key={health} health={health} />
      ))}
    </Flex>
  ),
};
