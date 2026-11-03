import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '..';

const meta = {
  title: 'Controls/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'DevBrain', icon: 'folder', variant: 'outline' },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
