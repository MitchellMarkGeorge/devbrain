import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { StatusIcon } from '../StatusIcon';
import { TaskStatus } from '@common/types';
import { OVERDUE_LABEL, TASK_STATUS_LABELS } from '../../types';
import { StatusMenu } from './StatusMenu';

const trigger = (status: TaskStatus, overdue = false) => (
  <button
    type="button"
    aria-label={`Status: ${overdue ? OVERDUE_LABEL : TASK_STATUS_LABELS[status]}`}
    style={{
      display: 'grid',
      placeItems: 'center',
      width: 24,
      height: 24,
      border: 0,
      borderRadius: 6,
      background: 'transparent',
      cursor: 'pointer',
    }}
  >
    <StatusIcon status={status} overdue={overdue} />
  </button>
);

const meta = {
  title: 'Entities/StatusMenu',
  component: StatusMenu,
  args: { status: TaskStatus.IN_PROGRESS, trigger: trigger(TaskStatus.IN_PROGRESS) },
  decorators: [
    (Story) => (
      <div style={{ paddingBottom: 160 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The current status is ticked and highlighted; the others show `1`, `2`, `3`. */
export const Open: Story = { args: { defaultOpen: true } };

/** An overdue task shows the flag but is still Not started, which the menu ticks. */
export const Overdue: Story = {
  args: {
    status: TaskStatus.NOT_STARTED,
    trigger: trigger(TaskStatus.NOT_STARTED, true),
    defaultOpen: true,
  },
};

export const Interactive: Story = {
  render: function Render() {
    const [status, setStatus] = useState<TaskStatus>(TaskStatus.NOT_STARTED);
    return (
      <Flex gap="2" align="center">
        <StatusMenu status={status} onStatusChange={setStatus} trigger={trigger(status)} />
        <Text tone="muted">{TASK_STATUS_LABELS[status]}</Text>
      </Flex>
    );
  },
};
