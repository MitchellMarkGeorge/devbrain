import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusMenu } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Planning/StatusMenu',
  component: StatusMenu,
  tags: ['autodocs'],
  args: { status: 'in-progress', onPick: fn() },
} satisfies Meta<typeof StatusMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
