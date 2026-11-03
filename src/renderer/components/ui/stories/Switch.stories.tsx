import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from '..';

const meta = {
  title: 'Controls/Switch',
  component: Switch,
  tags: ['autodocs'],
  args: { label: 'Start at login', defaultChecked: true },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Off: Story = { args: { defaultChecked: false } };
export const Disabled: Story = { args: { disabled: true } };
