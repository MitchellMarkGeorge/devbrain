import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Button } from '../Button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from './Popover';

const meta = {
  title: 'Components/Popover',
  component: Popover,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 220 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

const content = (
  <PopoverContent>
    <Stack gap="1">
      <PopoverTitle>Due date</PopoverTitle>
      <PopoverDescription>
        Pick when this task is due. Tasks past their date show as overdue.
      </PopoverDescription>
    </Stack>
  </PopoverContent>
);

export const Default: Story = {
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger render={<Button icon={CalendarDays} />}>Due Jul 1</PopoverTrigger>
      {content}
    </Popover>
  ),
};

export const Open: Story = { ...Default, args: { defaultOpen: true } };
