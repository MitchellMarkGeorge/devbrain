import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Tooltip } from '..';

const meta = {
  title: 'Overlays/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  args: {
    content: 'Create a new task',
    children: <Button icon="plus" size="icon" aria-label="New task" />,
  },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
