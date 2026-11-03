import type { Meta, StoryObj } from '@storybook/react-vite';
import { SwatchPicker } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Controls/SwatchPicker',
  component: SwatchPicker,
  tags: ['autodocs'],
  args: { defaultValue: 'indigo', onValueChange: fn() },
} satisfies Meta<typeof SwatchPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
