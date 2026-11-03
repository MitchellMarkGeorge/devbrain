import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Dialog, Field, Input } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  args: {
    title: 'New task',
    description: 'Add a task to your workspace.',
    actionLabel: 'Create Task',
    trigger: <Button>New Task</Button>,
    children: (
      <Field id="dialog-task" label="Task name">
        <Input id="dialog-task" placeholder="What needs doing?" />
      </Field>
    ),
    onAction: fn(),
  },
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Destructive: Story = {
  args: {
    title: 'Move task to trash?',
    description:
      'The task and its subtasks move to Trash. Linked notes stay in your workspace. You can restore the task from Trash.',
    actionLabel: 'Move to Trash',
    destructive: true,
    alert: true,
    children: undefined,
    trigger: <Button variant="destructive">Move to Trash</Button>,
  },
};
