import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, PriorityIcon } from '..';

const meta = {
  title: 'Content/PriorityIcon',
  component: PriorityIcon,
  tags: ['autodocs'],
  args: { priority: 'high' },
} satisfies Meta<typeof PriorityIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllPriorities: Story = {
  render: () => (
    <Flex gap={4}>
      {(['high', 'medium', 'low'] as const).map((priority) => (
        <PriorityIcon key={priority} priority={priority} />
      ))}
    </Flex>
  ),
};
