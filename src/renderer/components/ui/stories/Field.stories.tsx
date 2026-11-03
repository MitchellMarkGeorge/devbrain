import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Input } from '..';

const meta = {
  title: 'Controls/Field',
  component: Field,
  tags: ['autodocs'],
  args: {
    id: 'task-name',
    label: 'Task name',
    children: <Input id="task-name" placeholder="What needs doing?" />,
  },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Invalid: Story = {
  args: {
    error: 'Enter a task name before continuing.',
    children: <Input id="task-name" invalid defaultValue="" />,
  },
};
