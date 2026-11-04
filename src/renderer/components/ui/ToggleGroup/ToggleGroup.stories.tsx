import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Calendar,
  CircleCheck,
  FileText,
  Folder,
  LayoutGrid,
  List,
  SquareKanban,
} from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { ToggleGroup, ToggleGroupItem } from './ToggleGroup';

const meta = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  args: {
    'aria-label': 'Calendar range',
    items: [
      { value: 'month', label: 'Month' },
      { value: 'week', label: 'Week' },
      { value: 'day', label: 'Day' },
    ],
    defaultValue: 'week',
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline'] },
    size: { control: 'inline-radio', options: ['default', 'sm'] },
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The calendar range */
export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

/** List, grid and board views, icon only: each item is named by its value */
export const IconOnly: Story = {
  args: {
    'aria-label': 'View',
    defaultValue: 'List',
    items: [
      { value: 'List', icon: List },
      { value: 'Grid', icon: LayoutGrid },
      { value: 'Board', icon: SquareKanban },
    ],
  },
};

/** The search dialog's type filter: outline items with icons and counts */
export const OutlineWithCounts: Story = {
  args: {
    variant: 'outline',
    'aria-label': 'Result type',
    defaultValue: 'all',
    items: [
      { value: 'all', label: 'All', count: 24 },
      { value: 'tasks', label: 'Tasks', icon: CircleCheck, count: 12 },
      { value: 'notes', label: 'Notes', icon: FileText, count: 6 },
      { value: 'projects', label: 'Projects', icon: Folder, count: 4 },
      { value: 'events', label: 'Events', icon: Calendar, count: 2 },
    ],
  },
};

export const Composed: Story = {
  render: () => (
    <Stack gap="4">
      <ToggleGroup aria-label="Home filter" defaultValue="today">
        <ToggleGroupItem value="today">Today</ToggleGroupItem>
        <ToggleGroupItem value="upcoming">Upcoming</ToggleGroupItem>
        <ToggleGroupItem value="overdue">Overdue</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup aria-label="Settings section" variant="outline" defaultValue="general">
        <ToggleGroupItem value="general">General</ToggleGroupItem>
        <ToggleGroupItem value="tasks">Tasks</ToggleGroupItem>
        <ToggleGroupItem value="calendar">Calendar</ToggleGroupItem>
      </ToggleGroup>
    </Stack>
  ),
};
