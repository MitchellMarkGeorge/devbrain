import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { TaskPriority } from '@common/types';
import { PRIORITIES, PRIORITY_LABELS } from '../../types';
import { PriorityIcon } from './PriorityIcon';

const meta = {
  title: 'Entities/PriorityIcon',
  component: PriorityIcon,
  args: { priority: TaskPriority.HIGH, size: 16 },
  argTypes: {
    priority: { control: { type: 'inline-radio', labels: PRIORITY_LABELS }, options: PRIORITIES },
    size: { control: 'inline-radio', options: [12, 16, 24] },
  },
} satisfies Meta<typeof PriorityIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllPriorities: Story = {
  render: () => (
    <Stack gap="3">
      {PRIORITIES.map((priority) => (
        <Flex key={priority} gap="2" align="center">
          <PriorityIcon priority={priority} />
          <Text>{PRIORITY_LABELS[priority]}</Text>
        </Flex>
      ))}
    </Stack>
  ),
};
