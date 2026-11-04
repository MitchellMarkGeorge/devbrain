import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleCheck } from 'lucide-react';
import { Button } from '../Button';
import { Switch } from '../Switch';
import { SourceRow } from './SourceRow';

const meta = {
  title: 'Integrations/SourceRow',
  component: SourceRow,
  args: {
    icon: CircleCheck,
    title: 'Tasks',
    description: 'Issues assigned to you, with their projects',
    status: 'Synced 3 min ago',
    control: <Switch defaultChecked aria-label="Sync tasks" />,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 680 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SourceRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With a button, and paused (amber status) */
export const WithActionPaused: Story = {
  args: {
    icon: Calendar,
    title: 'Events',
    description: '2 of 5 calendars',
    action: (
      <Button variant="outline" size="sm">
        Choose Calendars
      </Button>
    ),
    status: 'Paused until you reconnect',
    tone: 'warning',
  },
};

/** The account is off: faded, its switch disabled */
export const Disabled: Story = {
  args: {
    status: 'Off · mirrored items are kept',
    disabled: true,
    control: <Switch disabled aria-label="Sync tasks" />,
  },
};
