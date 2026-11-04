import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from './Select';

const weekStarts = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
];

const meta = {
  title: 'Components/Select',
  component: Select,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Select {...args} items={weekStarts} defaultValue="monday">
      <SelectTrigger aria-label="Week starts on" />
      <SelectContent>
        {weekStarts.map((day) => (
          <SelectItem key={day.value} value={day.value}>
            {day.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const Open: Story = { ...Default, args: { defaultOpen: true } };

const timeZones = [
  { value: 'america-toronto', label: 'Toronto (GMT−5)' },
  { value: 'america-vancouver', label: 'Vancouver (GMT−8)' },
  { value: 'europe-london', label: 'London (GMT+0)' },
  { value: 'europe-berlin', label: 'Berlin (GMT+1)' },
];

export const GroupsAndPlaceholder: Story = {
  render: (args) => (
    <Flex gap="3">
      <Select {...args} items={timeZones}>
        <SelectTrigger placeholder="Choose a time zone" style={{ width: 220 }} />
        <SelectContent>
          <SelectGroup>
            <SelectGroupLabel>Americas</SelectGroupLabel>
            <SelectItem value="america-toronto">Toronto (GMT−5)</SelectItem>
            <SelectItem value="america-vancouver">Vancouver (GMT−8)</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectGroupLabel>Europe</SelectGroupLabel>
            <SelectItem value="europe-london">London (GMT+0)</SelectItem>
            <SelectItem value="europe-berlin">Berlin (GMT+1)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select items={weekStarts} defaultValue="sunday">
        <SelectTrigger size="sm" aria-label="Week starts on" />
        <SelectContent>
          {weekStarts.map((day) => (
            <SelectItem key={day.value} value={day.value}>
              {day.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Flex>
  ),
};
