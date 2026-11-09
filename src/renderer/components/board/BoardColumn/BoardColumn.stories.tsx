import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { TASK_STATUS_LABELS } from '../../types';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleProject,
  manyTasks,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { Board, BoardColumn } from './BoardColumn';

const DEVBRAIN = sampleProject('DevBrain 1.0', 'blue');

const notStarted = [
  sampleTask({
    title: 'Fix calendar sync for recurring events',
    priority: TaskPriority.HIGH,
    external: sampleLinear('ENG-131'),
    project: sampleProject('Calendar', 'green'),
    dueDate: storyDate(0),
  }),
  sampleTask({ title: 'Renew the domain', dueDate: storyDate(20) }),
];

const inProgress = [
  sampleTask({
    title: 'Ship the onboarding flow',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.HIGH,
    external: sampleLinear('ENG-124'),
    link: sampleEventLink('Mitchell / Jesse 1:1', 'indigo'),
    project: DEVBRAIN,
    subtaskProgress: { completed: 3, total: 4 },
    dueDate: storyDate(-3),
  }),
  sampleTask({
    title: 'Write the Q4 planning doc',
    status: TaskStatus.IN_PROGRESS,
    priority: TaskPriority.MEDIUM,
    link: sampleNoteLink('Q4 planning notes'),
    project: sampleProject('Planning', 'amber'),
    dueDate: storyDate(11),
  }),
];

const completed = [
  sampleTask({
    title: 'Set up the release pipeline',
    status: TaskStatus.COMPLETED,
    priority: TaskPriority.MEDIUM,
    external: sampleLinear('ENG-98'),
    project: DEVBRAIN,
    dueDate: storyDate(-2),
  }),
];

const meta = {
  title: 'Board/BoardColumn',
  component: BoardColumn,
  args: { status: TaskStatus.IN_PROGRESS, tasks: inProgress },
  argTypes: {
    status: {
      control: { type: 'select', labels: TASK_STATUS_LABELS },
      options: [TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED],
    },
  },
} satisfies Meta<typeof BoardColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <BoardColumn {...args} />
    </div>
  ),
};

export const Empty: Story = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <BoardColumn {...args} status={TaskStatus.NOT_STARTED} tasks={[]} />
    </div>
  ),
};

/** Three open columns, 24px apart; Completed has no "Add task" slot */
export const FullBoard: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <Board>
        <BoardColumn status={TaskStatus.NOT_STARTED} tasks={notStarted} />
        <BoardColumn
          status={TaskStatus.IN_PROGRESS}
          tasks={inProgress}
          cardProps={(_, i) => ({ state: i === 0 ? 'hover' : undefined })}
        />
        <BoardColumn status={TaskStatus.COMPLETED} tasks={completed} add={false} />
      </Board>
    </div>
  ),
};

/**
 * 1,000 cards a column, loaded 100 at a time as `onEndReached` fires: the board fills the
 * window's height and each column scrolls its own cards under its header, drawing only the cards
 * in view, measured as they draw (pills wrap). ↑/↓ on a card scroll the next into view.
 */
export const ThousandCards: Story = {
  name: '1,000 cards a column',
  parameters: { layout: 'fullscreen' },
  render: function ThousandCards() {
    const [loaded, setLoaded] = useState(100);
    const all = useMemo(() => manyTasks(3000), []);
    const column = (status: TaskStatus) =>
      all.filter((task) => task.status === status).slice(0, loaded);
    const more = () => setLoaded((count) => Math.min(1000, count + 100));
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          boxSizing: 'border-box',
          padding: 24,
          maxWidth: 1080,
        }}
      >
        <Board>
          {[TaskStatus.NOT_STARTED, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED].map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={column(status)}
              rowCount={1000}
              onEndReached={more}
              add={status !== TaskStatus.COMPLETED}
            />
          ))}
        </Board>
      </div>
    );
  },
};
