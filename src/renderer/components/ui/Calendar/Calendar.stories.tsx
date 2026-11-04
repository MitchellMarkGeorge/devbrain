import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DateRange } from 'react-day-picker';
import { Calendar } from './Calendar';

// a fixed month, so the picture does not change from day to day
const TODAY = new Date(2026, 4, 14);

const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  args: { today: TODAY, defaultMonth: TODAY },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleSelection: Story = {
  render: (args) => {
    const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 4, 21));
    return <Calendar {...args} mode="single" selected={selected} onSelect={setSelected} />;
  },
};

/** The start and due range picker */
export const Range: Story = {
  render: (args) => {
    const [range, setRange] = useState<DateRange | undefined>({
      from: new Date(2026, 4, 18),
      to: new Date(2026, 4, 22),
    });
    return <Calendar {...args} mode="range" selected={range} onSelect={setRange} />;
  },
};

export const OnCard: Story = {
  render: () => (
    <div
      style={{
        display: 'inline-block',
        padding: 12,
        borderRadius: 'var(--radius-lg)',
        background: 'var(--popover)',
        boxShadow: '0 0 0 1px var(--edge), var(--shadow-md)',
      }}
    >
      <Calendar today={TODAY} defaultMonth={TODAY} mode="single" selected={new Date(2026, 4, 21)} />
    </div>
  ),
};
