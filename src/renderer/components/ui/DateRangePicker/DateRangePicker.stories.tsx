import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker, type DateRangeEnd } from './DateRangePicker';

const TODAY = new Date(2026, 5, 22);

const meta = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
  args: {
    today: TODAY,
    value: { from: new Date(2026, 5, 22), to: new Date(2026, 6, 1) },
    active: 'due',
  },
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma's DateRangePicker: Jun 22 (today) → Jul 1, the due field active. */
export const Default: Story = {
  render: function Default(args) {
    const [value, setValue] = useState<DateRange | undefined>(args.value);
    const [active, setActive] = useState<DateRangeEnd>(args.active ?? 'start');
    return (
      <div
        style={{
          display: 'inline-block',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--popover)',
          boxShadow: '0 0 0 1px var(--edge), var(--shadow-md)',
        }}
      >
        <DateRangePicker
          {...args}
          value={value}
          onChange={setValue}
          active={active}
          onActiveChange={setActive}
          onClear={() => setValue(undefined)}
        />
      </div>
    );
  },
};
