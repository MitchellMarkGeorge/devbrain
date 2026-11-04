import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Clock } from 'lucide-react';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../Select';
import { DatePicker } from './DatePicker';

// a fixed today, so the picture does not change from day to day
const TODAY = new Date(2026, 5, 22);

const surface = {
  display: 'inline-block',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--popover)',
  boxShadow: '0 0 0 1px var(--edge), var(--shadow-md)',
  overflow: 'hidden',
} as const;

const TIMES = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM'];

function TimeSelect() {
  return (
    <Select defaultValue="10:30 AM">
      <SelectTrigger aria-label="Time">
        <Icon icon={Clock} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIMES.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const meta = {
  title: 'Components/DatePicker',
  component: DatePicker,
  args: { today: TODAY, value: new Date(2026, 5, 24) },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Figma's DatePicker: the field, the month, quick picks, the time and the footer. */
export const Full: Story = {
  render: function Full(args) {
    const [value, setValue] = useState<Date | undefined>(args.value);
    return (
      <div style={surface}>
        <DatePicker
          {...args}
          value={value}
          onChange={setValue}
          time={<TimeSelect />}
          onAddStart={() => undefined}
          onClear={() => setValue(undefined)}
        />
      </div>
    );
  },
};

/** Without a time or footer: just the field, the month and the quick picks. */
export const Minimal: Story = {
  render: function Minimal(args) {
    const [value, setValue] = useState<Date | undefined>(args.value);
    return (
      <div style={surface}>
        <DatePicker {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};

/** In its popover, opened from a due date. */
export const InPopover: Story = {
  render: function InPopover(args) {
    const [value, setValue] = useState<Date | undefined>(args.value);
    return (
      <div style={{ minHeight: 440 }}>
        <Popover defaultOpen>
          <PopoverTrigger render={<Button />}>
            {value?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? 'Due date'}
          </PopoverTrigger>
          <PopoverContent size="auto">
            <DatePicker
              {...args}
              value={value}
              onChange={setValue}
              time={<TimeSelect />}
              onAddStart={() => undefined}
              onClear={() => setValue(undefined)}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
};
