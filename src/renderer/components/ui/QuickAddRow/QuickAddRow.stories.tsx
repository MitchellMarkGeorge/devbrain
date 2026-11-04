import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../EntityPill';
import { TaskList } from '../TaskList';
import type { Task } from '../TaskRow';
import { QuickAddRow } from './QuickAddRow';

const meta = {
  title: 'Lists/QuickAddRow',
  component: QuickAddRow,
  args: {
    date: 'Today',
    dateTone: 'today',
    children: (
      <EntityPill type="project" color="blue">
        Auth Overhaul
      </EntityPill>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 860 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuickAddRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At rest: "+ Add task…". Click it to type. */
export const Placeholder: Story = {};

/** Typing: the ring, the new task's icon, what it inherits from its group and ↵. */
export const Typing: Story = {
  args: { state: 'typing', defaultValue: 'Draft PKCE FAQ for support' },
};

/** ↵ adds the task above and keeps the row open for the next one; Esc clears it. */
export const AtTheEndOfAList: Story = {
  render: function Interactive(args) {
    const [tasks, setTasks] = useState<Task[]>([
      {
        id: '1',
        title: 'Write PKCE migration guide',
        status: 'not-started',
        priority: 'medium',
        date: 'Today',
        dateTone: 'today',
      },
    ]);
    return (
      <div>
        <TaskList tasks={tasks} />
        <QuickAddRow
          {...args}
          onCreate={(title) =>
            setTasks((t) => [
              ...t,
              {
                id: String(t.length + 1),
                title,
                status: 'not-started',
                priority: 'medium',
                date: 'Today',
                dateTone: 'today',
              },
            ])
          }
        />
      </div>
    );
  },
};
