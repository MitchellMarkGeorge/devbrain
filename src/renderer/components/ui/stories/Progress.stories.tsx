import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from '..';

const meta = {
  title: 'Content/Progress',
  component: Progress,
  tags: ['autodocs'],
  args: { value: 25, label: 'Project completion' },
} satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Complete: Story = { args: { value: 100 } };
export const Indeterminate: Story = { args: { value: null } };
