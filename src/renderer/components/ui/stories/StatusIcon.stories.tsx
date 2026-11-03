import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, StatusIcon, Text } from '..';

const meta = {
  title: 'Content/StatusIcon',
  component: StatusIcon,
  tags: ['autodocs'],
  args: { status: 'in-progress' },
} satisfies Meta<typeof StatusIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllStatuses: Story = {
  render: () => (
    <Flex gap={4}>
      {(['not-started', 'in-progress', 'completed', 'cancelled', 'overdue'] as const).map(
        (status) => (
          <Flex key={status} gap={2}>
            <StatusIcon status={status} />
            <Text variant="meta">{status}</Text>
          </Flex>
        ),
      )}
    </Flex>
  ),
};
