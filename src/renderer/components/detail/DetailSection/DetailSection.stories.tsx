import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskStatus } from '@common/types';
import { Link, Plus } from 'lucide-react';
import { AddSlot } from '../AddSlot';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { LinkedTaskRow } from '../../lists/LinkedTaskRow';
import { ProgressRing } from '../../ui/ProgressRing';
import { DetailSection } from './DetailSection';
import { storyDate } from '../../lib/story-dates';

const meta = {
  title: 'Detail/DetailSection',
  component: DetailSection,
  decorators: [
    (Story) => (
      <div style={{ width: 348 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DetailSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A sheet's Subtasks: the progress ring and count, then "Add" */
export const Subtasks: Story = {
  args: {
    title: 'Subtasks',
    glyph: <ProgressRing value={3} total={4} size={12} />,
    count: '3/4',
    action: (
      <Button size="xs" icon={Plus}>
        Add
      </Button>
    ),
    children: (
      <div>
        <LinkedTaskRow
          task={{
            title: 'Generate code verifier',
            status: TaskStatus.COMPLETED,
            dueDate: storyDate(-6),
          }}
        />
        <LinkedTaskRow
          task={{ title: 'S256 challenge', status: TaskStatus.COMPLETED, dueDate: storyDate(-5) }}
        />
        <LinkedTaskRow
          task={{
            title: 'Token exchange endpoint',
            status: TaskStatus.COMPLETED,
            dueDate: storyDate(-3),
          }}
        />
        <LinkedTaskRow
          task={{ title: 'Mobile fallback', status: TaskStatus.NOT_STARTED, dueDate: storyDate(2) }}
        />
      </div>
    ),
  },
};

export const Empty: Story = {
  args: { title: 'Event note', children: <AddSlot>Add a note</AddSlot> },
};

/** A note's Tasks panel: the chevron folds it away */
export const Collapsible: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Tasks',
    collapsible: true,
    spacing: 'page',
    count: <Badge variant="secondary">2</Badge>,
    action: (
      <>
        <Button size="xs" variant="ghost" icon={Link}>
          Link Task
        </Button>
        <Button size="xs" icon={Plus}>
          New Task
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
        />
        <LinkedTaskRow
          task={{
            title: 'Audit token storage',
            status: TaskStatus.NOT_STARTED,
            dueDate: storyDate(-3),
          }}
        />
      </div>
    ),
  },
};
