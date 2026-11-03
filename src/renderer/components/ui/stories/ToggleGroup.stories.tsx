import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToggleGroup } from '..';

const meta = {
  title: 'Controls/ToggleGroup',
  component: ToggleGroup,
  tags: ['autodocs'],
  args: {
    label: 'Calendar range',
    items: [
      { value: 'month', label: 'Month' },
      { value: 'week', label: 'Week' },
      { value: 'day', label: 'Day' },
    ],
    defaultValue: 'week',
  },
} satisfies Meta<typeof ToggleGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Outline: Story = { args: { variant: 'outline' } };
export const Icons: Story = {
  args: {
    label: 'View',
    items: [
      { value: 'List', icon: 'list' },
      { value: 'Grid', icon: 'layout-grid' },
      { value: 'Board', icon: 'columns-3' },
    ],
  },
};
