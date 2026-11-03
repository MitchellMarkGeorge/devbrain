import type { Meta, StoryObj } from '@storybook/react-vite';
import { Kbd } from '..';

const meta = {
  title: 'Content/Kbd',
  component: Kbd,
  tags: ['autodocs'],
  args: { children: '⌘K' },
} satisfies Meta<typeof Kbd>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
