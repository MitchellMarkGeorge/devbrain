import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from '..';

const meta = {
  title: 'Controls/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: { label: 'Select task', defaultChecked: false },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Indeterminate: Story = { args: { indeterminate: true } };
export const Disabled: Story = { args: { disabled: true } };
