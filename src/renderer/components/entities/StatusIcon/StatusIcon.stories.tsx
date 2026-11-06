import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { TaskStatus } from '@common/types';
import { OVERDUE_LABEL, TASK_STATUS_LABELS } from '../../types';
import { StatusIcon } from './StatusIcon';

const STATUSES = [
  TaskStatus.NOT_STARTED,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
  TaskStatus.CANCELLED,
];

const meta = {
  title: 'Entities/StatusIcon',
  component: StatusIcon,
  args: { status: TaskStatus.IN_PROGRESS, overdue: false, size: 16 },
  argTypes: {
    status: { control: { type: 'select', labels: TASK_STATUS_LABELS }, options: STATUSES },
    size: { control: 'inline-radio', options: [12, 16, 24] },
  },
} satisfies Meta<typeof StatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Core's four statuses, then the flag a not-started task shows once it is overdue (`overdue`). */
export const AllStatuses: Story = {
  render: () => (
    <Stack gap="3">
      {STATUSES.map((status) => (
        <Flex key={status} gap="2" align="center">
          <StatusIcon status={status} />
          <Text>{TASK_STATUS_LABELS[status]}</Text>
        </Flex>
      ))}
      <Flex gap="2" align="center">
        <StatusIcon status={TaskStatus.NOT_STARTED} overdue />
        <Text>{OVERDUE_LABEL}</Text>
      </Flex>
    </Stack>
  ),
};

/** 12px inside badges and pills */
export const Small: Story = {
  render: () => (
    <Flex gap="3" align="center">
      {STATUSES.map((status) => (
        <StatusIcon key={status} status={status} size={12} />
      ))}
      <StatusIcon status={TaskStatus.NOT_STARTED} overdue size={12} />
    </Flex>
  ),
};
