import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '..';

const meta = {
  title: 'Controls/Input',
  component: Input,
  tags: ['autodocs'],
  args: { 'aria-label': 'Task name', placeholder: 'What needs doing?' },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Synced from Linear' } };
export const Invalid: Story = { args: { invalid: true, defaultValue: 'Invalid value' } };
