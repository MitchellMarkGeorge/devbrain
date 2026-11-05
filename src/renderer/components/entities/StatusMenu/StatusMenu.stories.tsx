import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { StatusIcon } from '../StatusIcon';
import { TASK_STATUS_LABELS, type TaskStatus } from '../../types';
import { StatusMenu } from './StatusMenu';

const trigger = (status: TaskStatus) => (
  <button
    type="button"
    aria-label={`Status: ${TASK_STATUS_LABELS[status]}`}
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
    <StatusIcon status={status} />
  </button>
);

const meta = {
  title: 'Entities/StatusMenu',
  component: StatusMenu,
  args: { status: 'in-progress', trigger: trigger('in-progress') },
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

/** Overdue ticks Not started: overdue comes from the due date. */
export const Overdue: Story = {
  args: { status: 'overdue', trigger: trigger('overdue'), defaultOpen: true },
};

export const Interactive: Story = {
  render: function Render() {
    const [status, setStatus] = useState<TaskStatus>('not-started');
    return (
      <Flex gap="2" align="center">
        <StatusMenu status={status} onStatusChange={setStatus} trigger={trigger(status)} />
        <Text tone="muted">{TASK_STATUS_LABELS[status]}</Text>
      </Flex>
    );
  },
};
