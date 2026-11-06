import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPriority, TaskStatus } from '@common/types';
import { storyDate } from '../../lib/story-dates';
import { TASK_STATUS_LABELS } from '../../types';
import {
  sampleEventLink,
  sampleLinear,
  sampleNoteLink,
  sampleProject,
  sampleTask,
} from '../../lists/TaskRow/fixtures';
import { BoardCard } from '../BoardCard';
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
  args: { status: TaskStatus.IN_PROGRESS },
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
      <BoardColumn {...args}>
        {inProgress.map((t) => (
          <BoardCard key={t.id} task={t} />
        ))}
      </BoardColumn>
    </div>
  ),
};

export const Empty: Story = {
  render: (args) => (
    <div style={{ width: 300 }}>
      <BoardColumn {...args} status={TaskStatus.NOT_STARTED} />
    </div>
  ),
};

/** Three open columns, 24px apart; Completed has no "Add task" slot */
export const FullBoard: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ padding: 24, maxWidth: 1080 }}>
      <Board>
        <BoardColumn status={TaskStatus.NOT_STARTED}>
          {notStarted.map((t) => (
            <BoardCard key={t.id} task={t} />
          ))}
        </BoardColumn>
        <BoardColumn status={TaskStatus.IN_PROGRESS}>
          {inProgress.map((t, i) => (
            <BoardCard key={t.id} task={t} state={i === 0 ? 'hover' : undefined} />
          ))}
        </BoardColumn>
        <BoardColumn status={TaskStatus.COMPLETED} add={false}>
          {completed.map((t) => (
            <BoardCard key={t.id} task={t} />
          ))}
        </BoardColumn>
      </Board>
    </div>
  ),
};
