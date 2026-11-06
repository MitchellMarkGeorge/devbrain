import { useState } from 'react';
import { TaskPriority } from '@common/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EntityPill } from '../../entities/EntityPill';
import { TaskList } from '../TaskList';
import type { TaskRowData } from '../TaskRow';
import { QuickAddRow } from './QuickAddRow';
import { sampleTask } from '../TaskRow/fixtures';
import { storyDate } from '../../lib/story-dates';
import type { TaskId } from '@common/ids';

const meta = {
  title: 'Lists/QuickAddRow',
  component: QuickAddRow,
  args: {
    date: 'Today',
    dateTone: 'today',
    children: <EntityPill entity={{ type: 'project', title: 'Auth Overhaul', color: 'blue' }} />,
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
    const [tasks, setTasks] = useState<TaskRowData[]>([
      sampleTask({
        id: 'tsk_1' as TaskId,
        title: 'Write PKCE migration guide',
        priority: TaskPriority.MEDIUM,
        dueDate: storyDate(0),
      }),
    ]);
    return (
      <div>
        <TaskList tasks={tasks} />
        <QuickAddRow
          {...args}
          onCreate={(title) =>
            setTasks((t) => [
              ...t,
              sampleTask({
                id: `tsk_${t.length + 1}` as TaskId,
                title,
                priority: TaskPriority.MEDIUM,
                dueDate: storyDate(0),
              }),
            ])
          }
        />
      </div>
    );
  },
};
