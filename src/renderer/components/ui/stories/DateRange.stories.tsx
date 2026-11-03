import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateRange } from '..';
import { fn } from 'storybook/test';

const meta = {
  title: 'Content/DateRange',
  component: DateRange,
  tags: ['autodocs'],
  args: { start: 'Nov 3', due: 'Nov 12', onStartClick: fn(), onDueClick: fn() },
} satisfies Meta<typeof DateRange>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
