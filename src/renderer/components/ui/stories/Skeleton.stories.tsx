import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from '..';

const meta = {
  title: 'Content/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  args: { width: 240, height: 32 },
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
