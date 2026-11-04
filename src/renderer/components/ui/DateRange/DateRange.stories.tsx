import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DateRange as DayRange } from 'react-day-picker';
import { Stack } from '../../layout/Flex';
import { Calendar } from '../Calendar';
import { DateRange } from './DateRange';

const meta = {
  title: 'Components/DateRange',
  component: DateRange,
  args: { due: 'Jul 1' },
  argTypes: { dueTone: { control: 'inline-radio', options: [undefined, 'today', 'overdue'] } },
} satisfies Meta<typeof DateRange>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The due date alone, with a muted "+ Start date" pill */
export const DueOnly: Story = {};

/** Once a start date is set: start → due */
export const StartAndDue: Story = { args: { start: 'Jun 24', due: 'Jul 1' } };

export const Tones: Story = {
  render: () => (
    <Stack gap="3">
      <DateRange due="Today" dueTone="today" />
      <DateRange due="Sep 28" dueTone="overdue" />
    </Stack>
  ),
};

const fmt = (d: Date | undefined) =>
  d?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Each pill opens its picker: the due pill a single-date calendar, the start pill the range. */
export const WithPickers: Story = {
  render: function WithPickers() {
    const [range, setRange] = useState<DayRange | undefined>({
      from: undefined,
      to: new Date(2026, 6, 1),
    });
    return (
      <div style={{ minHeight: 340 }}>
        <DateRange
          start={fmt(range?.from)}
          due={fmt(range?.to) ?? 'Add due date'}
          duePicker={
            <Calendar
              mode="single"
              defaultMonth={range?.to}
              selected={range?.to}
              onSelect={(to) => setRange((r) => ({ from: r?.from, to }))}
            />
          }
          startPicker={
            <Calendar mode="range" defaultMonth={range?.to} selected={range} onSelect={setRange} />
          }
        />
      </div>
    );
  },
};
