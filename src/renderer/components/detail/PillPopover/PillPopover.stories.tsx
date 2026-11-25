import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { CircleCheck, Link, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { LinkedTaskRow } from '../../lists/LinkedTaskRow';
import { storyDate } from '../../lib/story-dates';
import { PillPopover } from './PillPopover';

const meta = {
  title: 'Detail/PillPopover',
  component: PillPopover,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ height: 240 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PillPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A note's tasks, open: "Tasks" with Link and New, over its task rows */
export const Tasks: Story = {
  args: {
    glyph: CircleCheck,
    label: '2 tasks · 1 in progress',
    heading: 'Tasks',
    defaultOpen: true,
    action: (
      <>
        <Button size="xs" variant="ghost" icon={Link}>
          Link
        </Button>
        <Button size="xs" variant="ghost" icon={Plus}>
          New
        </Button>
      </>
    ),
    children: (
      <div>
        <LinkedTaskRow
          task={{
            title: 'Implement OAuth2 PKCE flow',
            status: TaskStatus.IN_PROGRESS,
            dueDate: storyDate(2),
          }}
          onOpen={() => {}}
        />
        <LinkedTaskRow
          task={{
            title: 'Write PKCE migration guide',
            status: TaskStatus.NOT_STARTED,
            dueDate: null,
          }}
          onOpen={() => {}}
        />
      </div>
    ),
  },
};

/** Closed: the pill alone, as the page shows it */
export const Closed: Story = { args: { ...Tasks.args, defaultOpen: false } };
