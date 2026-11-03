import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from '..';

const meta = {
  title: 'Content/Separator',
  component: Separator,
  tags: ['autodocs'],
  args: {},
} satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
