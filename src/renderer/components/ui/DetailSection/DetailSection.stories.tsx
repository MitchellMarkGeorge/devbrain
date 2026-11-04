import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link, Plus } from 'lucide-react';
import { AddSlot } from '../AddSlot';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { LinkedTaskRow } from '../LinkedTaskRow';
import { ProgressRing } from '../ProgressRing';
import { DetailSection } from './DetailSection';

const meta = {
  title: 'Components/DetailSection',
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
        <LinkedTaskRow title="Generate code verifier" status="completed" date="Jun 16" />
        <LinkedTaskRow title="S256 challenge" status="completed" date="Jun 17" />
        <LinkedTaskRow title="Token exchange endpoint" status="completed" date="Jun 19" />
        <LinkedTaskRow title="Mobile fallback" status="not-started" date="Jun 24" />
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
        <LinkedTaskRow title="Implement OAuth2 PKCE flow" status="in-progress" date="Jun 24" />
        <LinkedTaskRow
          title="Audit token storage"
          status="overdue"
          date="Jun 19"
          dateTone="overdue"
        />
      </div>
    ),
  },
};
