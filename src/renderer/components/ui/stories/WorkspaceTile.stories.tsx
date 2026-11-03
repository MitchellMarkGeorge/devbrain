import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceTile } from '..';

const meta = {
  title: 'Content/WorkspaceTile',
  component: WorkspaceTile,
  tags: ['autodocs'],
  args: { letter: 'D', color: 'indigo', size: 60 },
} satisfies Meta<typeof WorkspaceTile>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
