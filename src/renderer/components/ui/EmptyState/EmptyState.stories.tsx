import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, CircleCheck, FileText, Folder, ListFilter, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: {
    icon: CircleCheck,
    title: 'No tasks yet',
    description: 'Tasks you add, and Linear issues assigned to you, show up here.',
    placement: 'inline',
    action: (
      <Button size="sm" icon={Plus}>
        New Task
      </Button>
    ),
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Figma's "EmptyState examples": tasks, notes, projects, trash, a filter with no results, an empty day. */
export const Examples: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 440px)', gap: 24 }}>
      <EmptyState
        placement="inline"
        icon={CircleCheck}
        title="No tasks yet"
        description="Tasks you add, and Linear issues assigned to you, show up here."
        action={
          <Button size="sm" icon={Plus}>
            New Task
          </Button>
        }
      />
      <EmptyState
        placement="inline"
        icon={FileText}
        title="No notes yet"
        description="Write things down, then link them to tasks, projects and events."
        action={
          <Button size="sm" icon={Plus}>
            New Note
          </Button>
        }
      />
      <EmptyState
        placement="inline"
        icon={Folder}
        title="No projects yet"
        description="Group related tasks and notes under a project to track its progress."
        action={
          <Button size="sm" icon={Plus}>
            New Project
          </Button>
        }
      />
      <EmptyState
        placement="inline"
        icon={Trash2}
        title="Trash is empty"
        description="Tasks, projects and notes you move to trash stay here until you delete them."
      />
      <EmptyState
        placement="inline"
        icon={ListFilter}
        title="No tasks match these filters"
        description="Nothing is cancelled. Clear the filters to see all 7 tasks."
        action={
          <Button size="sm" icon={X}>
            Clear Filters
          </Button>
        }
      />
      <EmptyState
        placement="inline"
        icon={Calendar}
        title="Nothing scheduled"
        description="No events on Tuesday, June 23."
        action={
          <Button size="sm" icon={Plus}>
            New Event
          </Button>
        }
      />
    </div>
  ),
};
