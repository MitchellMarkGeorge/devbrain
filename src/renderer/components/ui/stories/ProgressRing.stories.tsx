import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressRing } from '..';

const meta = {
  title: 'Content/ProgressRing',
  component: ProgressRing,
  tags: ['autodocs'],
  args: { value: 3, total: 4, size: 24 },
} satisfies Meta<typeof ProgressRing>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
