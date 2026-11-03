import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box } from '..';

const meta = {
  title: 'Foundations/Box',
  component: Box,
  tags: ['autodocs'],
  args: {
    padding: 4,
    children: 'Token-based padding',
    style: { background: 'var(--card)', borderRadius: 'var(--radius-xl)' },
  },
} satisfies Meta<typeof Box>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
